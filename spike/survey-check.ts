// Is "down" real? Rechecks a random sample of failures from a second angle: public DNS over HTTPS, then a fresh probe.
import { probe } from "../src/probe"
const j = await Bun.file(".chainkiv/survey.json").json()
const down = j.rows.filter((r: any) => r.verdict === "down")
const pick = (list: any[], n: number) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
const dns = pick(down.filter((r: any) => r.outcome === "dns"), 40)
let resolves = 0, noName = 0, unknown = 0
for (const r of dns) {
  try {
    const host = new URL(r.url).hostname
    const a = await (await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) })).json() as any
    if (a.Answer?.length) resolves++
    else noName++
  } catch { unknown++ }
}
console.log({ dnsSample: dns.length, resolvesOnPublicDns: resolves, noSuchName: noName, unknown })
const others = pick(down.filter((r: any) => r.outcome !== "dns"), 40)
const again = await Promise.all(others.map((r: any) => probe(BigInt(r.chainId), r.url)))
console.log({ otherSample: others.length, upOnRecheck: again.filter((r) => r.up).length })
const base = j.rows.filter((r: any) => r.chainId === "8453" && r.verdict === "down")
const baseAgain = await Promise.all(base.map((r: any) => probe(8453n, r.url)))
console.log(baseAgain.map((r, i) => `${r.up ? "UP" : r.outcome} ${base[i].url.slice(0, 46)} (${r.error.slice(0, 30)})`).join("\n"))
process.exit(0)
