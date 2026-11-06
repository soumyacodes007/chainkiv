// Sepolia only. Proves the ENS design on a throwaway name, with throwaway wallets, before anything touches the real name:
// subnames resolve, a prober can write its text but not its address, and after a handover the hot key can publish
// releases but cannot take the name back. Costs a little Sepolia ETH, and never touches chainroll.eth.
import { createPublicClient, formatEther, http, parseEther, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { packetToBytes } from "viem/ens"
import { deployResolver, ensQuote, handOver, labelOf, registerName, setRecords, setupProbers, type ProberState } from "../src/ens"

const url = process.env.ETH_RPC_URL
const hot = privateKeyToAccount(process.env.PUBLISHER_KEY as Hex)
const cold = privateKeyToAccount(generatePrivateKey())
const prober = privateKeyToAccount(generatePrivateKey())
const name = `chainkiv-roles-${Date.now().toString(36)}.eth`
if (name.startsWith("chainroll")) throw new Error("this test must not run on the real name")
const version = BigInt(Date.now())
const client = createPublicClient({ chain: sepolia, transport: http(url) })
const started = await client.getBalance({ address: hot.address })
const log = (text: string) => console.log(`  ${text}`)
let bad = 0
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`)
  if (!ok) bad++
}

const { createWalletClient, encodeFunctionData, parseAbi, toHex } = await import("viem")
const setter = parseAbi(["function setText(bytes name, string key, string value)", "function setAddress(bytes name, uint256 coinType, bytes value)"])
const dns = (n: string) => toHex(packetToBytes(n))
/** Simulation only: asks the chain whether this wallet may do this, without spending gas on the refusal. */
const may = async (who: typeof hot, address: Hex, abi: any, functionName: string, args: unknown[]) => {
  try {
    await client.simulateContract({ account: who, address, abi, functionName, args })
    return true
  } catch {
    return false
  }
}
const fund = async (to: Hex) => {
  const wallet = createWalletClient({ chain: sepolia, transport: http(url), account: hot })
  await client.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to, value: parseEther("0.003") }) })
}

console.log(`Name ${name}\nStage 1: register and write the release records`)
await fund(cold.address)
await fund(prober.address)
const quote = await ensQuote(url, hot, name)
if (!quote.available) throw new Error("test name taken")
const resolver = await deployResolver(url, hot, { version })
await registerName(url, hot, name, resolver, log)
const records = { "arkiv.publisher": hot.address, "arkiv.latestAnchor": `0x${"a".repeat(64)}`, "arkiv.root": `0x${"b".repeat(64)}`, "arkiv.release": "1", "arkiv.metaHash": `0x${"c".repeat(64)}`, "arkiv.probers": `a.probers.${name}` }
const written = await setRecords(url, hot, name, resolver, records)
check("records read back through ENS", written.read["arkiv.root"] === records["arkiv.root"])

console.log("Stage 2: subname registries")
const state = await setupProbers(url, hot, name, resolver, [{ label: "a", address: prober.address }], {} as ProberState, async () => {}, log, version)
const sub = `a.probers.${name}`
const resolved = await client.getEnsAddress({ name: sub }).catch((e) => `error ${e.message.split("\n")[0]}`)
check("a prober subname resolves to its wallet", String(resolved).toLowerCase() === prober.address.toLowerCase(), String(resolved))
check("the subname carries its role record", (await client.getEnsText({ name: sub, key: "arkiv.role" })) === "prober")
const own = state.probers!.a!
check("the prober may write its text", await may(prober, own, setter, "setText", [dns(sub), "arkiv.region", "mumbai"]))
check("the prober may not change its address", !(await may(prober, own, setter, "setAddress", [dns(sub), 60n, cold.address])))
check("a prober may not touch the main name", !(await may(prober, resolver, setter, "setText", [dns(name), "arkiv.publisher", prober.address])))

console.log("Stage 3: hand over to the cold wallet")
const keep = ["arkiv.latestAnchor", "arkiv.root", "arkiv.release", "arkiv.metaHash"]
await handOver(url, hot, name, resolver, [state.nameRegistry!, state.proberRegistry!], cold.address, keep, log)
check("the hot key may still publish a release", await may(hot, resolver, setter, "setText", [dns(name), "arkiv.latestAnchor", "0x1"]))
check("the hot key may not change the publisher", !(await may(hot, resolver, setter, "setText", [dns(name), "arkiv.publisher", hot.address])))
check("the hot key may not change the prober list", !(await may(hot, resolver, setter, "setText", [dns(name), "arkiv.probers", "x"])))
check("the cold wallet can change the publisher", await may(cold, resolver, setter, "setText", [dns(name), "arkiv.publisher", cold.address]))
const registry = parseAbi(["function setSubregistry(uint256 anyId, address subregistry)", "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)"])
const ETH_REGISTRY = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4"
const { labelhash } = await import("viem/ens")
const id = BigInt(labelhash(labelOf(name)))
const zero = "0x0000000000000000000000000000000000000000"
check("the hot key may not repoint the name", !(await may(hot, ETH_REGISTRY, registry, "setSubregistry", [id, zero])))
check("the cold wallet can repoint the name", await may(cold, ETH_REGISTRY, registry, "setSubregistry", [id, state.nameRegistry]))
check("the hot key may not add a prober", !(await may(hot, state.proberRegistry!, registry, "register", ["evil", hot.address, zero, resolver, 0n, 2n ** 40n])))
check("the cold wallet can add a prober", await may(cold, state.proberRegistry!, registry, "register", ["c", cold.address, zero, resolver, 0n, 2n ** 40n]))
void encodeFunctionData

console.log(`Spent ${formatEther(started - (await client.getBalance({ address: hot.address })))} Sepolia ETH`)
console.log(bad ? `${bad} FAILED` : "All checks passed")
process.exit(bad ? 1 : 0)
