// Local chain only. Changes real records and checks Verify catches each change, then restores nothing: rerun the import.
import { str, bytes, u64, bool, i32 } from "@arkiv-network/sdk/schema"
import { ExpirationTime } from "@arkiv-network/sdk"
import { privateKeyToAccount } from "viem/accounts"
import type { Hex } from "viem"
import { LOCAL_CHAIN_ID, localNetwork, reader, writer } from "../src/arkiv"
import { createRegistry } from "../src/client"
import { Chain } from "../src/schemas"
import { readAnchor } from "../src/trust"

const net = localNetwork(process.env.ARKIV_RPC!)
if (net.chain.id !== LOCAL_CHAIN_ID || !/127\.0\.0\.1|localhost/.test(net.url)) throw new Error("local chain only")
const publisher = privateKeyToAccount(process.env.PUBLISHER_KEY as Hex)
const stranger = privateKeyToAccount(process.env.PROBER_KEY as Hex)
const client = reader(net)
const make = (who: string) => createRegistry({
  network: net,
  trust: async () => ({ publisher: who, anchorTx: process.env.CHAINKIV_ANCHOR_TX!, source: "local test settings" }),
  readAnchor: (tx) => readAnchor(client, tx as Hex),
  upstream: async () => ({ onMain: true, detail: "skipped in this test" }),
})
const fresh = () => make(publisher.address)
const failed = (v: { steps: { status: string; label: string; detail: string }[] }) => v.steps.find((s) => s.status === "fail")
let bad = 0
const expect = (name: string, ok: boolean, detail: string) => { console.log(`${ok ? "CAUGHT" : "MISSED"}  ${name}: ${detail}`); if (!ok) bad++ }

const before = await fresh().verify(10n)
console.log(`Before: chain 10 is ${before.state}`)

const pub = writer(net, publisher)
const c10 = (await fresh().getChain(10n))!
await pub.patchEntity(Chain, c10.key, { set: { status: str("deprecated") } })
await Bun.sleep(3000)
let v = await fresh().verify(10n)
expect("changed attribute", v.state === "failed", failed(v)?.detail ?? v.state)

const c56 = (await fresh().getChain(56n))!
const evil = new TextEncoder().encode(new TextDecoder().decode(c56.raw).replace(/https:\/\/[^"]+/, "https://evil.example"))
await pub.patchEntity(Chain, c56.key, { set: { raw: bytes(evil) } })
await Bun.sleep(3000)
v = await fresh().verify(56n)
expect("changed file, RPC swapped", v.state === "failed", failed(v)?.detail ?? v.state)

const fake = writer(net, stranger)
const copy = (await fresh().getChain(1n))!
await fake.createEntity(Chain, {
  chainId: u64(1n), shortName: str("eth"), name: str("Ethereum Mainnet"), chainFamily: str("ETH"), nativeSymbol: str("ETH"), nativeDecimals: i32(18),
  networkId: u64(1n), status: str("active"), layer: str("L1"), reusedChainId: bool(false), conflict: bool(false), eip155: bool(true), eip1559: bool(true),
  eip4844: bool(false), eip7702: bool(false), sourceBlob: str("0".repeat(40)), sourceCommit: str("0".repeat(40)),
  raw: bytes(new TextEncoder().encode(new TextDecoder().decode(copy.raw).replace(/https:\/\/[^"]+/, "https://evil.example"))),
}, { expiration: ExpirationTime.fromHours(1) })
await Bun.sleep(3000)
const shown = await fresh().getChain(1n)
expect("fake chain 1 from another wallet", !new TextDecoder().decode(shown!.raw).includes("evil.example"), "apps still read the publisher's record")
v = await make(stranger.address).verify(1n)
expect("fake wallet claims to be publisher", v.state === "failed", failed(v)?.detail ?? v.state)
console.log(bad ? `${bad} MISSED` : "All tampering caught")
process.exit(bad ? 1 : 0)
