// Probes every listed RPC once, read-only, and writes the result to .chainkiv/survey.json.
import { readSource } from "../src/source"
import { summarise, survey } from "../src/survey"
const [dir, commit] = process.argv.slice(2) as [string, string]
const source = await readSource(dir, commit)
const t = Date.now()
const result = await survey(source, { onProgress: (d, n) => console.log(`${d}/${n} ${Math.round((Date.now() - t) / 1000)}s`) })
const summary = summarise(result)
console.log(JSON.stringify(summary, null, 2))
const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)
await Bun.write(".chainkiv/survey.json", JSON.stringify({ commit, at: new Date().toISOString(), seconds: Math.round((Date.now() - t) / 1000), summary, genesis: Object.fromEntries(result.genesis), rows: result.rows }, replacer))
process.exit(0)
