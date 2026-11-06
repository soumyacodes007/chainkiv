// Measures reading freshness and how far the two probers agree. Read-only.
// Run: bun run --conditions browser spike/measure.ts
import { formatEther } from "viem"
import { rabdiNetwork, readAll, reader, val } from "../src/arkiv"
import { RpcHealth } from "../src/schemas"

const probers = { a: "0xecDEfDB69daF7De91615adf1D7bb955AA0D5a521", b: "0x6eEAaa1835b82A8ecbF11BAa9c109FE009534d17" }
const client = reader(rabdiNetwork(process.env.ARKIV_ACCESS_KEY ?? ""))
const now = Date.now() / 1000
const seconds = (t: bigint) => (t > 10_000_000_000n ? Number(t) / 1000 : Number(t))
const minutes = (s: number) => (s / 60).toFixed(1)
const passing = (r: any) => val(r.up) === true && val(r.chainIdOk) === true

const seen: Record<string, Map<string, any>> = {}
for (const [name, owner] of Object.entries(probers)) {
  const rows = await readAll<any>(client, { schema: RpcHealth, owner, select: { chainId: true, url: true, region: true, up: true, chainIdOk: true, checkedAt: true } })
  const ages = rows.map((r) => now - seconds(val<bigint>(r.checkedAt)!)).sort((x, y) => x - y)
  seen[name] = new Map(rows.map((r) => [`${val(r.chainId)}|${val(r.url)}`, r]))
  console.log(`Prober ${name} (${val(rows[0]?.region)}): ${rows.length} readings, ${rows.filter(passing).length} passing`)
  console.log(`  age in minutes: newest ${minutes(ages[0]!)}, median ${minutes(ages[ages.length >> 1]!)}, oldest ${minutes(ages[ages.length - 1]!)}`)
  console.log(`  over 15 minutes old: ${ages.filter((a) => a > 900).length}`)
  console.log(`  balance: ${formatEther(await client.getBalance({ address: owner as `0x${string}` }))} tGLM`)
}

const shared = [...seen.a!.keys()].filter((id) => seen.b!.has(id))
const both = shared.filter((id) => passing(seen.a!.get(id)) && passing(seen.b!.get(id))).length
const neither = shared.filter((id) => !passing(seen.a!.get(id)) && !passing(seen.b!.get(id))).length
console.log(`Read by both: ${shared.length}; both pass ${both}; both fail ${neither}; disagree ${shared.length - both - neither}`)

const newest = shared.map((id) => Math.max(seconds(val<bigint>(seen.a!.get(id).checkedAt)!), seconds(val<bigint>(seen.b!.get(id).checkedAt)!)))
const ages = newest.map((t) => now - t).sort((x, y) => x - y)
console.log(`Newest reading per RPC, from either prober: median ${minutes(ages[ages.length >> 1]!)} min, oldest ${minutes(ages[ages.length - 1]!)} min, over 15 min ${ages.filter((a) => a > 900).length}`)

// --watch N samples Ethereum's RPCs N times, 2 minutes apart: one reading of age tells little, because rounds are 20 minutes apart.
const watch = Number(process.argv[process.argv.indexOf("--watch") + 1])
if (process.argv.includes("--watch")) {
  const { eq } = await import("@arkiv-network/sdk/query")
  const { u64 } = await import("@arkiv-network/sdk/schema")
  for (let i = 0; i < watch; i++) {
    const read = async (owner: string) =>
      new Map((await readAll<any>(client, { schema: RpcHealth, owner, where: eq("chainId", u64(1n) as never), select: { url: true, checkedAt: true } })).map((r) => [val<string>(r.url)!, seconds(val<bigint>(r.checkedAt)!)]))
    const [a, b] = [await read(probers.a), await read(probers.b)]
    const t = Date.now() / 1000
    const worst = Math.max(...[...a.keys()].map((url) => t - Math.max(a.get(url)!, b.get(url) ?? 0)))
    console.log(`${new Date().toISOString()} A ${minutes(t - Math.min(...a.values()))} B ${minutes(t - Math.min(...b.values()))} worst newest ${minutes(worst)}`)
    await Bun.sleep(120_000)
  }
}
