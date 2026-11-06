// A read-only survey of every listed RPC. Needs no wallet. Anything that fails is tried once more later, so a brief
// network problem on this machine is not counted as a dead RPC.
import { pool, probe, type Reading } from "./probe"
import type { Source } from "./source"

export type Verdict = "passed" | "wrong-chain" | "wrong-genesis" | "stale" | "down" | "rate-limited" | "needs-key" | "refused"

export type GenesisVote = { hash: string | null; votes: number; voters: number }

/** A hash only counts as agreed when at least two RPCs on different hosts report it and they are a clear majority. */
export function agreeGenesis(readings: Reading[]): GenesisVote {
  const hosts = new Map<string, Set<string>>()
  const voters = new Set<string>()
  for (const r of readings) {
    if (!r.genesisSeen || !r.chainIdOk) continue
    const host = hostOf(r.url)
    voters.add(host)
    if (!hosts.has(r.genesisSeen)) hosts.set(r.genesisSeen, new Set())
    hosts.get(r.genesisSeen)!.add(host)
  }
  const ranked = [...hosts.entries()].sort((a, b) => b[1].size - a[1].size)
  const [top, next] = ranked
  if (!top || top[1].size < 2 || top[1].size === next?.[1].size) return { hash: null, votes: top?.[1].size ?? 0, voters: voters.size }
  return { hash: top[0], votes: top[1].size, voters: voters.size }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const STALE_SECONDS = 3600

export function verdictOf(r: Reading, agreed: string | null): Verdict {
  if (r.outcome === "skipped") return "needs-key"
  if (r.outcome === "blocked") return "refused"
  if (r.outcome === "rate-limited") return "rate-limited"
  if (r.reportedChainId !== null && !r.chainIdOk) return "wrong-chain"
  if (!r.up) return "down"
  if (agreed && r.genesisSeen !== agreed) return "wrong-genesis"
  if (r.blockTime && r.checkedAt - r.blockTime > STALE_SECONDS) return "stale"
  return "passed"
}

export type SurveyRow = Reading & { verdict: Verdict; lagBlocks: number }
export type Survey = { rows: SurveyRow[]; genesis: Map<string, GenesisVote>; retried: number }

export async function survey(source: Source, { limit = 48, onProgress }: { limit?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<Survey> {
  const jobs = source.chains.flatMap((c) => c.rpcs.map((r) => ({ chainId: c.attrs.chainId, url: r.url })))
  let done = 0
  const run = async (job: { chainId: bigint; url: string }) => {
    const reading = await probe(job.chainId, job.url)
    if (++done % 250 === 0) onProgress?.(done, jobs.length)
    return reading
  }
  const first = await pool(jobs, limit, 4, (j) => hostOf(j.url), run)

  const failed = first.flatMap((r, i) => (!r.up && r.outcome !== "skipped" && r.outcome !== "blocked" ? [i] : []))
  await Bun.sleep(5_000)
  const second = await pool(failed, Math.ceil(limit / 2), 2, (i) => hostOf(jobs[i]!.url), (i) => probe(jobs[i]!.chainId, jobs[i]!.url))
  failed.forEach((index, n) => {
    if (second[n]!.up || second[n]!.reportedChainId !== null) first[index] = second[n]!
  })

  const byChain = new Map<string, Reading[]>()
  for (const r of first) {
    const id = r.chainId.toString()
    if (!byChain.has(id)) byChain.set(id, [])
    byChain.get(id)!.push(r)
  }
  const genesis = new Map<string, GenesisVote>()
  const rows: SurveyRow[] = []
  for (const [id, readings] of byChain) {
    const vote = agreeGenesis(readings)
    genesis.set(id, vote)
    const head = readings.reduce((max, r) => (r.chainIdOk && r.blockNumber > max ? r.blockNumber : max), 0n)
    for (const r of readings) rows.push({ ...r, verdict: verdictOf(r, vote.hash), lagBlocks: r.up && r.chainIdOk ? Number(head - r.blockNumber) : -1 })
  }
  return { rows, genesis, retried: failed.length }
}

export function summarise(result: Survey) {
  const counts: Record<string, number> = {}
  for (const r of result.rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
  const reasons: Record<string, number> = {}
  for (const r of result.rows) if (r.verdict === "down") reasons[r.outcome] = (reasons[r.outcome] ?? 0) + 1
  const byChain = new Map<string, number>()
  for (const r of result.rows) {
    const id = r.chainId.toString()
    byChain.set(id, (byChain.get(id) ?? 0) + (r.verdict === "passed" ? 1 : 0))
  }
  const chainsWithNoPassingRpc = [...byChain.values()].filter((n) => n === 0).length
  return { total: result.rows.length, counts, reasons, chainsProbed: byChain.size, chainsWithNoPassingRpc, retried: result.retried }
}
