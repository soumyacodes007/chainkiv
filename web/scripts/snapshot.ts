// Builds web/public/snapshot.json: a cached copy of the registry the app can show instantly and fall back on when
// Arkiv cannot be reached. It holds real upstream data and, if one exists, the newest real survey. Nothing is invented.
//
//   bun web/scripts/snapshot.ts [--survey .chainkiv/survey.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : undefined
}

const response = await fetch("https://chainid.network/chains.json")
if (!response.ok) throw new Error(`chainid.network answered ${response.status}`)
const chains = (await response.json()) as Record<string, unknown>[]

const path = arg("survey") ?? ".chainkiv/survey.json"
const survey = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null

// One row per reading: verdict, latency, lag, block number, block hash, genesis seen, checked at, error.
const readings: Record<string, unknown[]> = {}
for (const r of survey?.rows ?? []) {
  readings[`${r.chainId}|${r.url}`] = [r.verdict, r.latencyMs, r.lagBlocks, r.blockNumber, r.blockHash, r.genesisSeen, r.checkedAt, r.error, r.outcome]
}

const out = {
  builtAt: new Date().toISOString(),
  upstream: { source: "chainid.network/chains.json", count: chains.length, commit: survey?.commit ?? null },
  survey: survey ? { at: survey.at, commit: survey.commit, seconds: survey.seconds, summary: survey.summary, genesis: survey.genesis } : null,
  chains,
  readings,
}
writeFileSync("web/public/snapshot.json", JSON.stringify(out))
console.log(`snapshot: ${chains.length} chains, ${Object.keys(readings).length} readings, survey ${survey ? survey.at : "none"}`)
