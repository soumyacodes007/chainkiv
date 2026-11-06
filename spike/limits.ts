// Finds the longest accepted lifetime and how many chain-sized entities fit in one batch. Local dev chain by default.
import { ExpirationTime } from "@arkiv-network/sdk"
import { bytes, str, defineSchema, u64 } from "@arkiv-network/sdk/schema"
import { privateKeyToAccount } from "viem/accounts"
import { localNetwork, rabdiNetwork, reader, writer } from "../src/arkiv"
const net = process.env.ARKIV_NETWORK === "local" ? localNetwork(process.env.ARKIV_RPC!) : rabdiNetwork(process.env.ARKIV_ACCESS_KEY ?? "")
const account = privateKeyToAccount(process.env.PUBLISHER_KEY as `0x${string}`)
const wallet = writer(net, account)
const T = defineSchema("chainkiv.limits", { n: u64().indexed(), label: str().indexed(), raw: bytes() })
const raw = new Uint8Array(1500).fill(97)
const one = (i: number, days: number) => ({ schema: T, values: { n: u64(BigInt(i)), label: str("x"), raw: bytes(raw) }, expiration: ExpirationTime.fromDays(days) })
const reason = (e: any) => String(e.shortMessage ?? e.message).split("\n")[0]!.slice(0, 140)
for (const days of [1, 7, 30, 60, 90, 120, 180, 200]) {
  try { await wallet.executeBatch({ creates: [one(1, days)] }); console.log(`lifetime ${days} days: ok`) }
  catch (e) { console.log(`lifetime ${days} days: ${reason(e)}`) }
}
for (const size of [5, 10, 20, 30, 40, 60, 100]) {
  const t = Date.now()
  try { await wallet.executeBatch({ creates: Array.from({ length: size }, (_, i) => one(i, 1)) }); console.log(`batch ${size}: ok ${Date.now() - t} ms`) }
  catch (e) { console.log(`batch ${size}: ${reason(e)}`) }
}
process.exit(0)
