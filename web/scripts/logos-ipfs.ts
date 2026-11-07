// Replaces stretched thumbnails with sharp logos: the originals EthereumLists links on IPFS, then Trust Wallet's for big
// chains EthereumLists has no icon for. Run it after logos.ts. Safe to stop and rerun: originals stay in .chainkiv/icons.
// The app's logo list is only rewritten at the end, so a running site doesn't reload for every file.
// Run: bun run web/scripts/logos-ipfs.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(web, "..")
const originals = resolve(repo, ".chainkiv/icons")
const folder = resolve(web, "public/logos")
const manifest = resolve(web, "src/lib/logos.json")
mkdirSync(originals, { recursive: true })

const SIZE = 192
/** A raster smaller than this would look as soft as the thumbnail it replaces. */
const MIN_SOURCE = 96
const RAW = "https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/icons"
const TRUST = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains"
/** Chain ID to Trust Wallet's folder. Listed by hand, so each logo is on the right chain. */
const CURATED: Record<string, string> = { "42161": "arbitrum", "10": "optimism", "56": "smartchain", "534352": "scroll" }
const GATEWAYS = [
  { url: "https://ipfs.filebase.io/ipfs/", workers: 4, restUntil: 0 },
  { url: "https://gateway.pinata.cloud/ipfs/", workers: 2, restUntil: 0 },
]
const ROUNDS = Number(process.env.LOGO_ROUNDS ?? 6)
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))
const log = (text: string) => console.log(`${new Date().toTimeString().slice(0, 8)} ${text}`)

type Icon = { name: string; cid: string }
const snapshot = JSON.parse(readFileSync(resolve(web, "public/snapshot.json"), "utf8")) as { chains: { chainId: number; icon?: string }[] }
const names = [...new Set(snapshot.chains.flatMap((c) => (c.icon ? [c.icon] : [])))]

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}

// Step 1: which IPFS file does each icon name point at?
const indexFile = resolve(originals, "index.json")
const index = (existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : {}) as Record<string, string>
await pool(names.filter((n) => !index[n]), 8, async (name) => {
  const got = await fetch(`${RAW}/${encodeURIComponent(name)}.json`, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const list = got?.ok ? ((await got.json().catch(() => null)) as { url?: string }[] | null) : null
  const url = list?.[0]?.url
  if (url?.startsWith("ipfs://")) index[name] = url.slice(7).replace(/^ipfs\//, "")
})
writeFileSync(indexFile, JSON.stringify(index))
log(`${Object.keys(index).length} of ${names.length} icon names point at IPFS`)

// Step 2: fetch each original once. A gateway that says slow down rests, and the others carry on.
const icons: Icon[] = Object.entries(index).map(([name, cid]) => ({ name, cid }))
const pathOf = (cid: string) => resolve(originals, cid.replace(/[^a-zA-Z0-9]/g, "_"))
const wanted = [...new Map(icons.map((i) => [i.cid, i])).values()]
let waiting = wanted.filter((i) => !existsSync(pathOf(i.cid)))
for (let round = 1; round <= ROUNDS && waiting.length; round++) {
  log(`Round ${round}: ${waiting.length} left to fetch of ${wanted.length}`)
  const queue = [...waiting]
  const failed: Icon[] = []
  let done = 0
  await Promise.all(
    GATEWAYS.flatMap((gateway) =>
      Array.from({ length: gateway.workers }, async () => {
        for (let icon = queue.shift(); icon; icon = queue.shift()) {
          if (gateway.restUntil > Date.now()) await pause(gateway.restUntil - Date.now())
          const got = await fetch(gateway.url + icon.cid, { signal: AbortSignal.timeout(25_000) }).catch(() => null)
          if (got?.status === 429) gateway.restUntil = Date.now() + 30_000
          const data = got?.ok ? new Uint8Array(await got.arrayBuffer().catch(() => new ArrayBuffer(0))) : null
          if (data?.length) writeFileSync(pathOf(icon.cid), data)
          else failed.push(icon)
          if (++done % 50 === 0) log(`  ${done} tried this round, ${failed.length} failed`)
        }
      }),
    ),
  )
  waiting = failed
  if (waiting.length && round < ROUNDS) await pause(30_000)
}
if (waiting.length) log(`Could not fetch ${waiting.length}. Rerun later to try them again.`)

// Step 3: one small file per icon, for the sizes the app really draws.
const done = new Map<string, string>()
let soft = 0
let broken = 0
async function shrink(source: Uint8Array | Buffer, name: string) {
  const image = sharp(source, { density: 400, limitInputPixels: 80_000_000 })
  const { width = 0, height = 0, format } = await image.metadata()
  if (format !== "svg" && Math.min(width, height) < MIN_SOURCE) return false
  await image.resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toFile(resolve(folder, name))
  return true
}
for (const { name, cid } of icons) {
  const path = pathOf(cid)
  if (!existsSync(path)) continue
  const file = `u-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.webp`
  const kept = await shrink(readFileSync(path), file).catch(() => ((broken++), null))
  if (kept) done.set(name, file)
  else if (kept === false) soft++
}
log(`${done.size} sharp logos, ${soft} too small to use, ${broken} unreadable`)

const logos = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>
for (const chain of snapshot.chains) {
  const file = chain.icon && done.get(chain.icon)
  if (file) logos[String(chain.chainId)] = file
}
for (const [id, slug] of Object.entries(CURATED)) {
  const got = await fetch(`${TRUST}/${slug}/info/logo.png`, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const data = got?.ok ? Buffer.from(await got.arrayBuffer()) : null
  if (data && (await shrink(data, `t-${id}.webp`).catch(() => false))) logos[id] = `t-${id}.webp`
  else log(`No sharp logo for chain ${id}`)
}
const sorted = Object.fromEntries(Object.entries(logos).sort(([a], [b]) => Number(a) - Number(b)))
writeFileSync(manifest, `${JSON.stringify(sorted)}\n`)
const llamaOnly = Object.entries(sorted).filter(([, f]) => /^\d/.test(f)).map(([id]) => id)
log(`Finished: ${Object.keys(sorted).length} of ${snapshot.chains.length} chains have a logo. Still soft: ${llamaOnly.length} (${llamaOnly.join(" ")})`)
