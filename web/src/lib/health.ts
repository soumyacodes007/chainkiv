// Turns readings into the one thing a person wants to know about an RPC. The rules are the PRD's badges.
// Green always means "passed checks", never "safe".
import { isStaleHead } from "../../../src/readings"
import type { Reading, RpcRow, Verdict } from "./types"

export type Tone = "green" | "teal" | "amber" | "violet" | "red" | "gray"
export type Assessment = { tone: Tone; label: string; detail: string; latency?: number; verdict: string }

const STALE_AFTER = 1800
const SLOW_MS = 1500

export const toneVar = (t: Tone) => (t === "gray" ? "var(--text-4)" : `var(--${t})`)
/** Answers on the right chain. A network with one of these has something that works, confirmed or not. */
export const works = (t: Tone) => t === "green" || t === "teal"

/** The buckets every chart shares, so a number means the same thing on every page. */
export const GROUPS: { key: string; label: string; color: string; verdicts: string[] }[] = [
  { key: "passed", label: "Passed checks", color: "var(--green)", verdicts: ["passed"] },
  { key: "unconfirmed", label: "Works, first block unconfirmed", color: "var(--teal)", verdicts: ["unconfirmed"] },
  { key: "behind", label: "Stale, limited or disputed", color: "var(--amber)", verdicts: ["stale", "rate-limited", "split", "partial"] },
  { key: "wrong", label: "Wrong chain or genesis", color: "var(--violet)", verdicts: ["wrong-chain", "wrong-genesis"] },
  { key: "down", label: "Not answering", color: "var(--red)", verdicts: ["down"] },
  { key: "gray", label: "Not checkable", color: "var(--text-4)", verdicts: ["needs-key", "refused", "none"] },
]
export const groupOf = (verdict: string) => GROUPS.find((g) => g.verdicts.includes(verdict)) ?? GROUPS[5]!

const SURVEY: Record<Verdict, [Tone, string, string]> = {
  passed: ["green", "Passed checks", "Answered on the right chain with the agreed first block, and its head is current"],
  unconfirmed: ["teal", "Works, unconfirmed", "Answers on the right chain, but its first block could not be confirmed"],
  stale: ["amber", "Stale head", "Answers, but its newest block is over an hour old, or it is far behind other RPCs"],
  "rate-limited": ["amber", "Rate limited", "Asked us to slow down, so this is not counted as down"],
  "wrong-chain": ["violet", "Wrong chain", "Answers with a different chain ID from the one listed"],
  "wrong-genesis": ["violet", "Wrong genesis", "Claims this chain ID but has a different first block"],
  down: ["red", "Not answering", "Did not answer the checks"],
  "needs-key": ["gray", "Needs an API key", "Cannot be checked without a private key, so it is never recommended"],
  refused: ["gray", "Not checked", "Points at a private address, so we refuse to call it"],
}

// Matches the prober's rule. Probe code can't load in a browser, so the words are repeated here.
const LIMIT_MESSAGE = /rate.?limit|too many requests|reached .*limit|limit (exceeded|reached)|quota/i
const failed = (r: Reading) => !r.up || !r.chainIdOk || r.genesis === "bad"
/** PRD edge 29: a 429 says the RPC is busy, not that it is down. */
const limited = (r: Reading) => r.error === "HTTP 429" || LIMIT_MESSAGE.test(r.error)
/** Gave its chain ID, then failed a later check. It is there, so "not answering" would be wrong. */
const partial = (r: Reading) => !r.up && r.chainIdOk
const hoursOld = (r: Reading) => Math.round((r.checkedAt - (r.blockTime ?? r.checkedAt)) / 3600)

/** Was the RPC actually called? False for ones we refuse to call or can't call without a key. */
export const wasCalled = (r?: Reading) => !!r && r.verdict !== "needs-key" && r.verdict !== "refused"

export function assess(rpc: RpcRow): Assessment {
  if (rpc.needsApiKey) return { tone: "gray", verdict: "needs-key", label: "Needs an API key", detail: SURVEY["needs-key"][2] }
  const list = rpc.readings
  if (!list.length) return { tone: "gray", verdict: "none", label: "No reading yet", detail: "No prober has measured this RPC yet" }

  const first = list[0]!
  if (first.prober === "survey" && first.verdict) {
    const latency = first.latencyMs > 0 ? first.latencyMs : undefined
    // PRD edge 28: with no agreed first block this is never green.
    if (first.verdict === "passed" && first.genesis === "unknown") return { tone: "teal", verdict: "unconfirmed", label: "Works, unconfirmed", detail: "Answers on the right chain, but too few RPCs responded to agree on its first block", latency }
    const [tone, label, detail] = SURVEY[first.verdict]
    return { tone, label, detail, verdict: first.verdict, latency }
  }

  const now = Date.now() / 1000
  const fresh = list.filter((r) => now - r.checkedAt <= STALE_AFTER)
  if (!fresh.length) return { tone: "gray", verdict: "none", label: "Stale", detail: "The newest reading is over 30 minutes old" }

  const pass = fresh.filter((r) => !failed(r))
  const fail = fresh.filter((r) => failed(r) && !limited(r))
  if (!pass.length && !fail.length) return { tone: "amber", verdict: "rate-limited", label: "Rate limited", detail: SURVEY["rate-limited"][2] }
  const latency = pass.length ? Math.min(...pass.map((r) => r.latencyMs)) : undefined
  if (pass.length && fail.length) return { tone: "amber", verdict: "split", label: "Probers disagree", detail: `${pass.length} passed, ${fail.length} failed`, latency }
  if (pass.length && pass.every(isStaleHead)) return { tone: "amber", verdict: "stale", label: "Stale head", detail: hoursOld(pass[0]!) ? `Answers, but its newest block is ${hoursOld(pass[0]!)} h old` : "Answers, but it is far behind other RPCs", latency }
  if (pass.length && pass.every((r) => r.genesis === "unknown")) return { tone: "teal", verdict: "unconfirmed", label: "Works, unconfirmed", detail: "Too few RPCs responded to agree on its first block", latency }
  if (pass.length >= 2 && latency! <= SLOW_MS) return { tone: "green", verdict: "passed", label: "Passed checks", detail: `Passed from ${pass.length} probers`, latency }
  if (pass.length) return { tone: "amber", verdict: "passed", label: latency! > SLOW_MS ? "Slow" : "Passed, one prober", detail: `Passed from ${pass.length} prober${pass.length > 1 ? "s" : ""}`, latency }
  const r = fail[0]!
  const wrong = r.up && !r.chainIdOk ? "Wrong chain" : r.genesis === "bad" ? "Wrong genesis" : ""
  const half = !wrong && fail.every(partial)
  const why = wrong || (half ? "Partly answering" : "Not answering")
  return fail.length >= 2
    ? { tone: wrong ? "violet" : half ? "amber" : "red", verdict: wrong ? "wrong-chain" : half ? "partial" : "down", label: why, detail: half ? `Gave its chain ID, then failed: ${r.error}` : `Failed from ${fail.length} probers` }
    : { tone: "amber", verdict: "split", label: `${why}, one prober`, detail: "A second prober has to agree before this turns red" }
}

export type Rollup = { total: number; green: number; teal: number; amber: number; violet: number; red: number; gray: number; chainsLive: number; chainsDead: number; byVerdict: Record<string, number> }

/** RPCs fit for Add to wallet: passed checks, no API key, fastest first. */
export function bestRpcs(rpcs: RpcRow[]) {
  return rpcs
    .map((rpc) => ({ rpc, a: assess(rpc) }))
    .filter((x) => x.a.tone === "green" && !x.rpc.needsApiKey && x.rpc.protocol.startsWith("http"))
    .sort((x, y) => (x.a.latency ?? 9e9) - (y.a.latency ?? 9e9))
}
