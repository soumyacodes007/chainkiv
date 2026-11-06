// One probing round: read the listed RPCs from Arkiv, probe them, publish signed readings. Each RPC has one entity per
// prober that is patched in place, so a round does not add to Arkiv's purge load.
import { ExpirationTime } from "@arkiv-network/sdk"
import { bool, bytes, dec, i32, str, u64 } from "@arkiv-network/sdk/schema"
import { Database } from "bun:sqlite"
import { hexToBytes, type Hex, type LocalAccount } from "viem"
import { readAll, val } from "./arkiv"
import { pool, probeOnline, VERSION, type Reading } from "./probe"
import { readingText } from "./readings"
import { Chain, Rpc, RpcHealth, RpcStats } from "./schemas"
import { agreeGenesis, hostOf } from "./survey"

export const HEALTH_HOURS = 2
export const STATS_DAYS = 2
const BATCH = 20

/** Chains probed every round even though upstream leaves their status blank. */
const MAJOR_CHAINS = [1n, 10n, 56n, 100n, 137n, 250n, 324n, 1101n, 5000n, 8453n, 42161n, 42220n, 43114n, 59144n, 81457n, 534352n, 11155111n, 84532n]

export type Target = { chainId: bigint; url: string }

export async function loadTargets(client: any, publisher: string, tier: number, only?: bigint[]): Promise<Target[]> {
  const [chains, rpcs] = await Promise.all([
    readAll<any>(client, { schema: Chain, owner: publisher, select: { chainId: true, status: true } }),
    readAll<any>(client, { schema: Rpc, owner: publisher, select: { chainId: true, url: true, needsApiKey: true } }),
  ])
  const status = new Map(chains.map((c) => [val<bigint>(c.chainId)!, val<string>(c.status)!]))
  const wanted = (id: bigint) => {
    if (only?.length) return only.includes(id)
    const s = status.get(id)
    if (tier === 1) return s === "active" || MAJOR_CHAINS.includes(id)
    if (tier === 2) return s !== "deprecated"
    return true
  }
  return rpcs
    .filter((r) => !val<boolean>(r.needsApiKey) && wanted(val<bigint>(r.chainId)!))
    .map((r) => ({ chainId: val<bigint>(r.chainId)!, url: val<string>(r.url)! }))
}

export function openHistory(path: string) {
  const db = new Database(path, { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("CREATE TABLE IF NOT EXISTS samples (url TEXT, chain TEXT, ts INTEGER, up INTEGER, latency INTEGER)")
  db.run("CREATE INDEX IF NOT EXISTS samples_url ON samples (url, ts)")
  return db
}

export type Round = { probed: number; up: number; created: number; patched: number; seconds: number }

export async function runRound(opts: {
  client: any
  wallet: any
  account: LocalAccount
  region: string
  targets: Target[]
  genesis: Record<string, string>
  history: Database
}): Promise<Round> {
  const { client, wallet, account, region, targets, genesis, history } = opts
  const start = Date.now()
  const readings = await pool(targets, 32, 4, (t) => hostOf(t.url), (t) => probeOnline(t.chainId, t.url))

  const byChain = new Map<string, Reading[]>()
  for (const r of readings) {
    const id = r.chainId.toString()
    if (!byChain.has(id)) byChain.set(id, [])
    byChain.get(id)!.push(r)
  }

  const existing = await readAll<any>(client, { schema: RpcHealth, owner: account.address, select: { url: true, chainId: true } })
  const keys = new Map(existing.map((e) => [`${val(e.chainId)}|${val(e.url)}`, e.$key as string]))

  const creates: any[] = []
  const patches: any[] = []
  const extensions: any[] = []
  const expiration = ExpirationTime.fromHours(HEALTH_HOURS)
  const insert = history.prepare("INSERT INTO samples VALUES (?, ?, ?, ?, ?)")

  for (const [id, list] of byChain) {
    const agreed = genesis[id] ?? agreeGenesis(list).hash
    const head = list.reduce((max, r) => (r.chainIdOk && r.blockNumber > max ? r.blockNumber : max), 0n)
    for (const r of list) {
      const fields = {
        chainId: r.chainId,
        url: r.url,
        up: r.up,
        chainIdOk: r.chainIdOk,
        genesis: !agreed || !r.genesisSeen ? "unknown" : r.genesisSeen === agreed ? "ok" : "bad",
        latencyMs: r.latencyMs,
        lagBlocks: r.up && r.chainIdOk ? Number(head - r.blockNumber) : -1,
        checkedAt: BigInt(r.checkedAt),
        blockNumber: r.blockNumber,
        blockHash: r.blockHash,
        genesisSeen: r.genesisSeen,
      }
      const sig = await account.signMessage({ message: readingText(fields) })
      const values = {
        chainId: u64(fields.chainId), url: str(fields.url), region: str(region), up: bool(fields.up), chainIdOk: bool(fields.chainIdOk),
        genesis: str(fields.genesis), latencyMs: i32(fields.latencyMs), lagBlocks: i32(fields.lagBlocks), checkedAt: u64(fields.checkedAt),
        blockNumber: u64(fields.blockNumber), blockHash: str(fields.blockHash), genesisSeen: str(fields.genesisSeen),
        error: str(r.error), proberVersion: str(VERSION), sig: bytes(hexToBytes(sig as Hex)),
      }
      const key = keys.get(`${r.chainId}|${r.url}`)
      if (key) {
        patches.push({ schema: RpcHealth, entityKey: key, set: values })
        extensions.push({ entityKey: key, expiration })
      } else creates.push({ schema: RpcHealth, values, expiration })
      if (r.outcome !== "rate-limited") insert.run(r.url, id, r.checkedAt, r.up ? 1 : 0, r.latencyMs)
    }
  }

  for (let i = 0; i < creates.length; i += BATCH) await wallet.executeBatch({ creates: creates.slice(i, i + BATCH) })
  for (let i = 0; i < patches.length; i += BATCH) {
    await wallet.executeBatch({ patches: patches.slice(i, i + BATCH), extensions: extensions.slice(i, i + BATCH) })
  }
  return { probed: readings.length, up: readings.filter((r) => r.up).length, created: creates.length, patched: patches.length, seconds: Math.round((Date.now() - start) / 1000) }
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

export function statsFor(history: Database, url: string, now: number) {
  const since = (seconds: number) => history.query<{ up: number; latency: number }, [string, number]>("SELECT up, latency FROM samples WHERE url = ? AND ts >= ?").all(url, now - seconds)
  const day = since(86_400)
  const week = since(7 * 86_400)
  const uptime = (rows: { up: number }[]) => (rows.length ? rows.filter((r) => r.up).length / rows.length : 0)
  const latencies = day.filter((r) => r.up).map((r) => r.latency).sort((a, b) => a - b)
  return { uptime24h: uptime(day), uptime7d: uptime(week), p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95), samples24h: day.length }
}

export async function publishStats(opts: { client: any; wallet: any; account: LocalAccount; targets: Target[]; history: Database }) {
  const { client, wallet, account, targets, history } = opts
  const now = Math.floor(Date.now() / 1000)
  const existing = await readAll<any>(client, { schema: RpcStats, owner: account.address, select: { url: true, chainId: true } })
  const keys = new Map(existing.map((e) => [`${val(e.chainId)}|${val(e.url)}`, e.$key as string]))
  const creates: any[] = []
  const patches: any[] = []
  const extensions: any[] = []
  const expiration = ExpirationTime.fromDays(STATS_DAYS)
  for (const t of targets) {
    const s = statsFor(history, t.url, now)
    if (!s.samples24h) continue
    const values = {
      chainId: u64(t.chainId), url: str(t.url), uptime24h: dec(s.uptime24h.toFixed(4)), uptime7d: dec(s.uptime7d.toFixed(4)),
      p50Ms: i32(s.p50Ms), p95Ms: i32(s.p95Ms), samples24h: i32(s.samples24h),
    }
    const key = keys.get(`${t.chainId}|${t.url}`)
    if (key) {
      patches.push({ schema: RpcStats, entityKey: key, set: values })
      extensions.push({ entityKey: key, expiration })
    } else creates.push({ schema: RpcStats, values, expiration })
  }
  for (let i = 0; i < creates.length; i += BATCH) await wallet.executeBatch({ creates: creates.slice(i, i + BATCH) })
  for (let i = 0; i < patches.length; i += BATCH) await wallet.executeBatch({ patches: patches.slice(i, i + BATCH), extensions: extensions.slice(i, i + BATCH) })
  return creates.length + patches.length
}
