// Re-scores a saved survey with the current rules and prints the numbers used in arkiv/data-quality.md.
import { verdictOf } from "../src/survey"
const j = await Bun.file(".chainkiv/survey.json").json()
const rows = j.rows.map((r: any) => ({ ...r, verdict: verdictOf({ ...r, chainId: BigInt(r.chainId), blockNumber: BigInt(r.blockNumber) }, j.genesis[r.chainId]?.hash ?? null) }))
const count = (list: any[], f: (r: any) => string) => list.reduce((o: Record<string, number>, r) => ((o[f(r)] = (o[f(r)] ?? 0) + 1), o), {})
const tested = rows.filter((r: any) => !["needs-key", "refused"].includes(r.verdict))
const chains = new Map<string, number>()
for (const r of tested) chains.set(r.chainId, (chains.get(r.chainId) ?? 0) + (r.verdict === "passed" ? 1 : 0))
console.log(JSON.stringify({ commit: j.commit, at: j.at, total: rows.length, tested: tested.length, verdicts: count(rows, (r) => r.verdict), downReasons: count(rows.filter((r: any) => r.verdict === "down"), (r) => r.outcome), chainsTested: chains.size, chainsNoPassing: [...chains.values()].filter((n) => !n).length, realWrongGenesis: rows.filter((r: any) => r.verdict === "wrong-genesis").map((r: any) => `${r.chainId} ${r.url}`).slice(0, 8), base: count(rows.filter((r: any) => r.chainId === "8453"), (r) => r.verdict), eth: count(rows.filter((r: any) => r.chainId === "1"), (r) => r.verdict) }, null, 1))
