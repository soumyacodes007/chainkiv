// The read side: what the web app, the CLI and other apps use. Browser-safe.
import { and, eq, gte, lte, startsWith } from "@arkiv-network/sdk/query"
import { bool, str, u64 } from "@arkiv-network/sdk/schema"
import { keccak256, type Hex } from "viem"
import { reader, readAll, toBytes, val, type Network } from "./arkiv"
import { chainlistHash, policyHash } from "./chainlist"
import { parseFile, type ChainFile } from "./derive"
import { readingText, signerOf } from "./readings"
import type { Anchor, ReleaseMeta } from "./release"
import { Chain, Explorer, Manifest, PrivacyPolicy, Release, ReleaseMeta as MetaSchema, Rpc, RpcHealth, RpcPrivacy, RpcStats } from "./schemas"
import { checkChain, checkRelease, upstreamFromGitHub, type ReleaseCheck, type ReleaseInputs, type Verdict } from "./verify"

export type Prober = { name: string; address: string }
export type Trust = { publisher: string; anchorTx: string; source: string; root?: string; probers?: Prober[] }

export type RegistryOptions = {
  network: Network
  /** Who the publisher is and which anchor is latest. Must come from Ethereum, not Arkiv. */
  trust: () => Promise<Trust>
  readAnchor: (tx: string) => Promise<{ anchor: Anchor | null; from: string }>
  upstream?: ReleaseInputs["upstream"]
}

export type ChainSummary = { key: string; chainId: bigint; name: string; shortName: string; layer: string; status: string; nativeSymbol: string; parentChainId?: bigint; reusedChainId: boolean }
export type ChainDetail = ChainSummary & { raw: Uint8Array; file: ChainFile; attrs: Record<string, unknown>; expiresAt: bigint }
export type RpcRow = { url: string; protocol: string; needsApiKey: boolean; origin: string }
export type ExplorerRow = { name: string; url: string; standard: string }

export type Health = {
  chainId: bigint
  prober: string
  url: string
  region: string
  up: boolean
  chainIdOk: boolean
  genesis: string
  latencyMs: number
  lagBlocks: number
  checkedAt: number
  blockNumber: bigint
  blockHash: string
  genesisSeen: string
  error: string
}

/** What Chainlist reports about an RPC. It comes from Chainlist and the providers, and ChainKiv does not check it. */
export type Privacy = { url: string; tracking: string; policyKey: string; source: string; sourceCommit: string; licence: string }

export type Stats = { prober: string; url: string; uptime24h: number; uptime7d: number; p50Ms: number; p95Ms: number; samples24h: number }

const SUMMARY = { chainId: true, name: true, shortName: true, layer: true, status: true, nativeSymbol: true, parentChainId: true, reusedChainId: true } as const

const summary = (row: any): ChainSummary => ({
  key: row.$key,
  chainId: val<bigint>(row.chainId)!,
  name: val<string>(row.name)!,
  shortName: val<string>(row.shortName)!,
  layer: val<string>(row.layer)!,
  status: val<string>(row.status)!,
  nativeSymbol: val<string>(row.nativeSymbol)!,
  parentChainId: val<bigint>(row.parentChainId),
  reusedChainId: val<boolean>(row.reusedChainId)!,
})

export type Filters = { parentChainId?: bigint; layer?: string; status?: string; nativeSymbol?: string; reusedChainId?: boolean; shortNamePrefix?: string; minChainId?: bigint; maxChainId?: bigint }

export function createRegistry(options: RegistryOptions) {
  const client = reader(options.network)
  let trustCache: Promise<Trust> | undefined
  let releaseCache: Promise<ReleaseCheck> | undefined
  let metaCache: Promise<ReleaseMeta | null> | undefined

  // A failed read isn't remembered, or a brief outage would last until the page reloads.
  const trust = () =>
    (trustCache ??= options.trust().catch((e) => {
      trustCache = undefined
      throw e
    }))
  const owner = async () => (await trust()).publisher

  async function manifest(root: string): Promise<Uint8Array[]> {
    const rows = await readAll(client, { schema: Manifest, owner: await owner(), where: eq("merkleRoot", str(root)) })
    const parts = rows.sort((a: any, b: any) => val<number>(a.part)! - val<number>(b.part)!)
    if (!parts.length) throw new Error("No manifest for this root on Arkiv")
    const expected = val<number>((parts[0] as any).parts)!
    if (parts.length !== expected) throw new Error(`Manifest has ${parts.length} of ${expected} parts`)
    return parts.map((p: any) => toBytes(val(p.data)))
  }

  const release = () =>
    (releaseCache ??= checkRelease({
      publisher: trust,
      anchor: options.readAnchor,
      manifest,
      upstream: options.upstream ?? ((commit) => upstreamFromGitHub(commit)),
    }))

  /** Trusted probers and agreed genesis hashes, accepted only if they match the hash in the anchor. */
  const meta = () =>
    (metaCache ??= (async () => {
      const check = await release()
      if (!check.anchor) return null
      const rows = await readAll(client, { schema: MetaSchema, owner: await owner(), where: eq("metaHash", str(check.anchor.metaHash)) })
      for (const row of rows as any[]) {
        const bytes = toBytes(val(row.data))
        if (keccak256(bytes) === check.anchor.metaHash) return JSON.parse(new TextDecoder().decode(bytes)) as ReleaseMeta
      }
      return null
    })())

  /** ENS names the probers when it can, so one can be added or removed at once. Otherwise the signed release does. */
  const probers = async (): Promise<Prober[]> => {
    const named = (await trust()).probers
    return named?.length ? named : ((await meta())?.probers ?? []).map((address) => ({ name: "", address }))
  }

  async function getChain(chainId: bigint): Promise<ChainDetail | null> {
    const rows = await readAll<any>(client, { schema: Chain, owner: await owner(), where: eq("chainId", u64(chainId)) })
    const row = rows[0]
    if (!row) return null
    const raw = toBytes(val(row.raw))
    const attrs = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("$") && k !== "raw").map(([k, v]) => [k, val(v as { value: unknown })]))
    return { ...summary(row), raw, file: parseFile(raw), attrs, expiresAt: BigInt(row.$expiresAt) }
  }

  async function findChains(filters: Filters = {}): Promise<ChainSummary[]> {
    const terms: unknown[] = []
    if (filters.parentChainId !== undefined) terms.push(eq("parentChainId", u64(filters.parentChainId)))
    if (filters.layer) terms.push(eq("layer", str(filters.layer)))
    if (filters.status) terms.push(eq("status", str(filters.status)))
    if (filters.nativeSymbol) terms.push(eq("nativeSymbol", str(filters.nativeSymbol)))
    if (filters.reusedChainId !== undefined) terms.push(eq("reusedChainId", bool(filters.reusedChainId)))
    if (filters.shortNamePrefix) terms.push(startsWith("shortName", filters.shortNamePrefix))
    if (filters.minChainId !== undefined) terms.push(gte("chainId", u64(filters.minChainId)))
    if (filters.maxChainId !== undefined) terms.push(lte("chainId", u64(filters.maxChainId)))
    const where = terms.length > 1 ? and(...(terms as [never, never])) : terms[0]
    const rows = await readAll(client, { schema: Chain, owner: await owner(), where, select: SUMMARY })
    return rows.map(summary)
  }

  async function rpcs(chainId: bigint): Promise<RpcRow[]> {
    const rows = await readAll<any>(client, { schema: Rpc, owner: await owner(), where: eq("chainId", u64(chainId)) })
    return rows.map((r) => ({ url: val(r.url)!, protocol: val(r.protocol)!, needsApiKey: val(r.needsApiKey)!, origin: val(r.origin)! }))
  }

  async function explorers(chainId: bigint): Promise<ExplorerRow[]> {
    const rows = await readAll<any>(client, { schema: Explorer, owner: await owner(), where: eq("chainId", u64(chainId)) })
    return rows.map((r) => ({ name: val(r.name)!, url: val(r.url)!, standard: val(r.standard)! }))
  }

  async function privacy(chainId: bigint): Promise<Privacy[]> {
    const rows = await readAll<any>(client, { schema: RpcPrivacy, owner: await owner(), where: eq("chainId", u64(chainId)) })
    return rows.map((r) => ({ url: val(r.url)!, tracking: val(r.tracking)!, policyKey: val(r.policyKey)!, source: val(r.source)!, sourceCommit: val(r.sourceCommit)!, licence: val(r.licence)! }))
  }

  async function policy(policyKey: string): Promise<string | null> {
    const rows = await readAll<any>(client, { schema: PrivacyPolicy, owner: await owner(), where: eq("policyKey", str(policyKey)) })
    return rows[0] ? new TextDecoder().decode(toBytes(val(rows[0].text))) : null
  }

  /** Rebuilds the hash of every Chainlist row and compares it with the signed release. */
  async function verifyChainlist() {
    const signed = (await meta())?.chainlist
    if (!signed) return { ok: false, detail: "The signed release does not cover Chainlist data" }
    const publisher = await owner()
    const [rows, policies] = await Promise.all([
      readAll<any>(client, { schema: RpcPrivacy, owner: publisher }),
      readAll<any>(client, { schema: PrivacyPolicy, owner: publisher }),
    ])
    const hashes = new Map(policies.map((p) => [val<string>(p.policyKey)!, policyHash(new TextDecoder().decode(toBytes(val(p.text))))]))
    const hash = chainlistHash(rows.map((r) => ({ chainId: val<bigint>(r.chainId)!, url: val<string>(r.url)!, tracking: val<string>(r.tracking)!, policy: val<string>(r.policyKey) ? (hashes.get(val<string>(r.policyKey)!) ?? "missing") : "" })))
    const ok = hash === signed.hash && rows.length === signed.count
    return { ok, detail: ok ? `${rows.length} rows match Chainlist commit ${signed.commit.slice(0, 10)}` : `Holds ${rows.length} rows, signed for ${signed.count}, or a row was changed` }
  }

  /** A reading counts only if its signature recovers to that prober. */
  async function readHealth(where?: ReturnType<typeof eq>): Promise<Health[]> {
    const trusted = (await probers()).map((p) => p.address)
    const lists = await Promise.all(trusted.map(async (prober) => {
      const rows = await readAll<any>(client, { schema: RpcHealth, owner: prober, where })
      const checked = await Promise.all(rows.map(async (r) => {
        const fields = {
          chainId: val<bigint>(r.chainId)!, url: val<string>(r.url)!, up: val<boolean>(r.up)!, chainIdOk: val<boolean>(r.chainIdOk)!, genesis: val<string>(r.genesis)!,
          latencyMs: val<number>(r.latencyMs)!, lagBlocks: val<number>(r.lagBlocks)!, checkedAt: val<bigint>(r.checkedAt)!,
          blockNumber: val<bigint>(r.blockNumber)!, blockHash: val<string>(r.blockHash)!, genesisSeen: val<string>(r.genesisSeen)!,
        }
        const sig = val<string>(r.sig) as Hex
        const signer = await signerOf(fields, sig).catch(() => "")
        if (signer.toLowerCase() !== prober.toLowerCase()) return null
        return { ...fields, prober, region: val<string>(r.region)!, error: val<string>(r.error) ?? "", checkedAt: Number(fields.checkedAt) } as Health
      }))
      return checked.filter((h): h is Health => h !== null)
    }))
    return lists.flat()
  }

  const health = (chainId: bigint) => readHealth(eq("chainId", u64(chainId)))
  /** Every reading from every prober, in a few pages: one query per chain would cost a site visitor hundreds of requests. */
  const allHealth = () => readHealth()

  async function healthyRpcs(chainId: bigint, { minProbers = 1, maxLatencyMs = Infinity, maxAgeSeconds = 1800 } = {}) {
    const readings = await health(chainId)
    const now = Date.now() / 1000
    const passing = new Map<string, Health[]>()
    for (const h of readings) {
      if (!h.up || !h.chainIdOk || h.genesis !== "ok" || now - h.checkedAt > maxAgeSeconds) continue
      if (!passing.has(h.url)) passing.set(h.url, [])
      passing.get(h.url)!.push(h)
    }
    return [...passing.entries()]
      .filter(([, list]) => list.length >= minProbers && Math.min(...list.map((h) => h.latencyMs)) <= maxLatencyMs)
      .map(([url, list]) => ({ url, probers: list.length, latencyMs: Math.min(...list.map((h) => h.latencyMs)) }))
      .sort((a, b) => a.latencyMs - b.latencyMs)
  }

  async function stats(chainId: bigint, url?: string): Promise<Stats[]> {
    const trusted = (await probers()).map((p) => p.address)
    const where = url ? and(eq("chainId", u64(chainId)), eq("url", str(url))) : eq("chainId", u64(chainId))
    const lists = await Promise.all(trusted.map(async (prober) => {
      const rows = await readAll<any>(client, { schema: RpcStats, owner: prober, where })
      return rows.map((r) => ({
        prober, url: val<string>(r.url)!, uptime24h: Number(val(r.uptime24h)), uptime7d: Number(val(r.uptime7d)),
        p50Ms: val<number>(r.p50Ms)!, p95Ms: val<number>(r.p95Ms)!, samples24h: val<number>(r.samples24h)!,
      }))
    }))
    return lists.flat()
  }

  async function verify(chainId: bigint): Promise<Verdict> {
    const [check, chain] = await Promise.all([release(), getChain(chainId)])
    if (!chain) return { ok: false, state: "failed", steps: [...check.steps, { id: "file", group: "data", label: "Record is the upstream file", status: "fail", detail: `The publisher has no record for chain ${chainId}` }] }
    return checkChain(check, chainId, { raw: chain.raw, attrs: chain.attrs })
  }

  /** Reads every chain with its raw file, for `verify --all` and the upstream file format. */
  async function everyChain(): Promise<ChainDetail[]> {
    const rows = await readAll<any>(client, { schema: Chain, owner: await owner() })
    return rows.map((row) => {
      const raw = toBytes(val(row.raw))
      const attrs = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("$") && k !== "raw").map(([k, v]) => [k, val(v as { value: unknown })]))
      return { ...summary(row), raw, file: parseFile(raw), attrs, expiresAt: BigInt(row.$expiresAt) }
    })
  }

  async function verifyAll() {
    const [check, chains] = await Promise.all([release(), everyChain()])
    const results = chains.map((c) => ({ chainId: c.chainId, verdict: checkChain(check, c.chainId, { raw: c.raw, attrs: c.attrs }) }))
    const present = new Set(chains.map((c) => c.chainId))
    const missing = check.allLeaves ? check.allLeaves.filter((l) => !present.has(l.chainId)).map((l) => l.chainId) : []
    return { check, results, missing, verified: results.filter((r) => r.verdict.ok).length }
  }

  const latestRelease = async () => (await release()).anchor ?? null
  const releases = async () => {
    const rows = await readAll<any>(client, { schema: Release, owner: await owner() })
    return rows.map((r) => ({ releaseNo: val<bigint>(r.releaseNo)!, commit: val<string>(r.commit)!, root: val<string>(r.merkleRoot)!, chainCount: val<bigint>(r.chainCount)!, anchorNetwork: val<string>(r.anchorNetwork)!, anchorTx: val<string>(r.anchorTx) }))
      .sort((a, b) => (a.releaseNo < b.releaseNo ? 1 : -1))
  }

  const toChainsJson = async () => (await everyChain()).map((c) => c.file).sort((a, b) => a.chainId - b.chainId)

  return { client, trust, release, meta, probers, getChain, findChains, rpcs, explorers, privacy, policy, verifyChainlist, allHealth, health, healthyRpcs, stats, verify, verifyAll, latestRelease, releases, toChainsJson }
}

export { readingText }
export type Registry = ReturnType<typeof createRegistry>
