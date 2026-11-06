// Runs every query in arkiv/why-arkiv.md against Rabdi and prints how many records each one returns.
// Read-only. Run: bun run --conditions browser spike/why-arkiv-queries.ts
import { rabdiNetwork } from "../src/arkiv"

const publisher = "0xb6d7BE32085f47D07dE996e2dA8F7664408fA304"
const proberA = "0xecDEfDB69daF7De91615adf1D7bb955AA0D5a521"
const proberB = "0x6eEAaa1835b82A8ecbF11BAa9c109FE009534d17"
const stranger = "0x000000000000000000000000000000000000dEaD"
const schema = (name: string) => `arkiv.schema = str('chainkiv.${name}')`
const by = (owner: string) => `$owner = addr(${owner})`

export const queries: [string, string][] = [
  ["Which chain has ID 8453?", `${schema("chain")} AND chainId = u64(8453) AND ${by(publisher)}`],
  ["Which chains are L2s of Ethereum?", `${schema("chain")} AND parentChainId = u64(1) AND ${by(publisher)}`],
  ["Which short names start with base?", `${schema("chain")} AND shortName STARTSWITH str('base') AND ${by(publisher)}`],
  ["Which chains use ETH as their currency?", `${schema("chain")} AND nativeSymbol = str('ETH') AND ${by(publisher)}`],
  ["Which chains reuse another chain's ID?", `${schema("chain")} AND reusedChainId = true AND ${by(publisher)}`],
  ["Which RPCs are listed for Base?", `${schema("rpc")} AND chainId = u64(8453) AND ${by(publisher)}`],
  ["Which Ethereum RPCs pass right now, from Prober A?", `${schema("rpcHealth")} AND chainId = u64(1) AND up = true AND chainIdOk = true AND ${by(proberA)}`],
  ["Which Ethereum RPCs pass right now, from Prober B?", `${schema("rpcHealth")} AND chainId = u64(1) AND up = true AND chainIdOk = true AND ${by(proberB)}`],
  ["Which Ethereum RPCs are more than 10 blocks behind?", `${schema("rpcHealth")} AND chainId = u64(1) AND up = true AND lagBlocks > 10 AND ${by(proberA)}`],
  ["Which probed RPCs answer for the wrong chain?", `${schema("rpcHealth")} AND up = true AND chainIdOk = false AND ${by(proberA)}`],
  ["Which Ethereum RPCs does Chainlist report as not tracking?", `${schema("rpcPrivacy")} AND chainId = u64(1) AND tracking = str('none') AND ${by(publisher)}`],
  ["Which release is signed, and at what commit?", `${schema("release")} AND ${by(publisher)}`],
  ["Does a stranger's chain 1 show up?", `${schema("chain")} AND chainId = u64(1) AND ${by(stranger)}`],
  ["What has anyone proposed?", schema("proposal")],
]

if (import.meta.main) {
  const net = rabdiNetwork(process.env.ARKIV_ACCESS_KEY ?? "")
  for (const [question, query] of queries) {
    const started = performance.now()
    const response = await fetch(net.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "arkiv_query", params: [query, { select: { key: true }, limit: 100 }] }),
    })
    const body: any = await response.json().catch(() => ({ error: response.status }))
    const rows = body.result?.data ?? body.result?.entities ?? body.result
    const count = Array.isArray(rows) ? `${rows.length}${rows.length === 100 ? "+" : ""}` : JSON.stringify(body).slice(0, 120)
    console.log(`${count}\t${Math.round(performance.now() - started)} ms\t${question}`)
  }
}
