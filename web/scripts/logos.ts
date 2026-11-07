// Downloads real chain logos into web/public/logos, so the site serves them itself and no third party can fail mid-visit.
// Logos are matched by chain ID, never by name, so one can't land on a different network that shares its name.
// Run: bun run web/scripts/logos.ts
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const folder = resolve(web, "public/logos")
const SIZE = 128
/** Below this the service has sent its blank placeholder, not a logo. */
const MIN_BYTES = 200
const EXTENSIONS: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" }

type LlamaChain = { name: string; chainId: number | string | null }

const snapshot = JSON.parse(readFileSync(resolve(web, "public/snapshot.json"), "utf8")) as { chains: { chainId: number }[] }
const listed = new Set(snapshot.chains.map((c) => Number(c.chainId)))
const response = await fetch("https://api.llama.fi/v2/chains")
if (!response.ok) throw new Error(`DefiLlama answered ${response.status}`)
const wanted = ((await response.json()) as LlamaChain[]).filter((c) => c.chainId !== null && listed.has(Number(c.chainId)))

rmSync(folder, { recursive: true, force: true })
mkdirSync(folder, { recursive: true })

const files: Record<string, string> = {}
const missed: string[] = []
let next = 0
let bytes = 0
async function worker() {
  while (next < wanted.length) {
    const chain = wanted[next++]!
    const id = String(Number(chain.chainId))
    const slug = chain.name.toLowerCase().replace(/ /g, "-")
    const got = await fetch(`https://icons.llamao.fi/icons/chains/rsz_${slug}?w=${SIZE}&h=${SIZE}`, { headers: { accept: "image/webp,image/png,*/*" }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
    const extension = EXTENSIONS[got?.headers.get("content-type")?.split(";")[0] ?? ""]
    const data = got?.ok && extension ? new Uint8Array(await got.arrayBuffer()) : null
    if (!data || data.length < MIN_BYTES) {
      missed.push(chain.name)
      continue
    }
    writeFileSync(resolve(folder, `${id}.${extension}`), data)
    files[id] = `${id}.${extension}`
    bytes += data.length
  }
}
await Promise.all(Array.from({ length: 8 }, worker))

const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => Number(a) - Number(b)))
writeFileSync(resolve(web, "src/lib/logos.json"), `${JSON.stringify(sorted)}\n`)
console.log(`${Object.keys(files).length} logos, ${Math.round(bytes / 1024)} KB. Missed: ${missed.join(", ") || "none"}`)
