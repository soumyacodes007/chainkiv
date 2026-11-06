// Registers the publisher's name on the ENSv2 Sepolia deployment and writes its records. Sepolia only: the fee is
// MockUSDC, a free test token, and these addresses come from docs.ens.domains/learn/deployments.
import {
  createPublicClient, createWalletClient, encodeAbiParameters, encodeFunctionData, erc20Abi, http, keccak256, parseAbi,
  parseEventLogs, stringToHex, toHex, type Account, type Address, type Hex,
} from "viem"
import { sepolia } from "viem/chains"
import { labelhash, namehash, normalize, packetToBytes } from "viem/ens"

const ETH_REGISTRAR: Address = "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3"
const MOCK_USDC: Address = "0x240b0316df57887dbbe58b586508b19e633a14aa"
const ETH_REGISTRY: Address = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4"
const USER_REGISTRY_IMPL: Address = "0x9bd8a88719068d09ecee662f36c0e3856708366a"
const FACTORY: Address = "0xda70306c98e97ece36f997a21368e53298572991"
const RESOLVER_IMPL: Address = "0x115eb53f0c60696633855f90b138178fb40b2b2c"
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n
const ROLE_SET_TEXT = 1n << 4n
/** What the owner of a new subname keeps: it can move the name and change where it points. */
const SUBNAME_ROLES = (1n << 20n) | ((1n << 20n) << 128n) | (1n << 24n) | ((1n << 24n) << 128n) | ((1n << 28n) << 128n)
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000"
const ZERO_BYTES: Hex = `0x${"0".repeat(64)}`
const ONE_YEAR = 31_536_000n

const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
])
const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
])
const resolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes value)",
  "function multicall(bytes[] data) returns (bytes[])",
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
])
const registryAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "function setSubregistry(uint256 anyId, address subregistry)",
  "function setParent(address parent, string label)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
])
const mintAbi = parseAbi(["function mint(address to, uint256 amount)"])

export const labelOf = (name: string) => {
  const parts = normalize(name).split(".")
  if (parts.length !== 2 || parts[1] !== "eth") throw new Error(`Expected a name like chainroll.eth, got ${name}`)
  return parts[0]!
}

function clients(url: string | undefined, account: Account) {
  return {
    client: createPublicClient({ chain: sepolia, transport: http(url) }),
    wallet: createWalletClient({ chain: sepolia, transport: http(url), account }),
  }
}

export async function ensQuote(url: string | undefined, account: Account, name: string) {
  const { client } = clients(url, account)
  const label = labelOf(name)
  const available = await client.readContract({ address: ETH_REGISTRAR, abi: registrarAbi, functionName: "isAvailable", args: [label] })
  if (!available) return { label, available, total: 0n }
  const [base, premium] = await client.readContract({ address: ETH_REGISTRAR, abi: registrarAbi, functionName: "getRegisterPrice", args: [label, ONE_YEAR, MOCK_USDC] })
  return { label, available, total: base + premium }
}

async function deploy(url: string | undefined, account: Account, implementation: Address, salt: bigint, data: Hex): Promise<Address> {
  const { client, wallet } = clients(url, account)
  const hash = await wallet.writeContract({ address: FACTORY, abi: factoryAbi, functionName: "deployProxy", args: [implementation, salt, data] })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`Deployment failed: ${hash}`)
  const [log] = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs: receipt.logs })
  if (!log) throw new Error(`No proxy address in ${hash}`)
  return log.args.proxyAddress
}

/** A write that must have worked before the next step runs. */
async function write(url: string | undefined, account: Account, call: any) {
  const { client, wallet } = clients(url, account)
  const hash = await wallet.writeContract(call)
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`${call.functionName} failed: ${hash}`)
  return hash
}

const hashOf = (...parts: { type: string; value: unknown }[]) =>
  BigInt(keccak256(encodeAbiParameters(parts.map((p) => ({ type: p.type })), parts.map((p) => p.value) as never)))

/**
 * Each deployer gets its own resolver and holds every role on it. ENSv2 resolver roles cover every name on a resolver,
 * so a name managed by someone else needs its own instance, which `seed` and `extra` provide.
 */
export async function deployResolver(url: string | undefined, account: Account, { seed = "OwnedResolver", version = 0n, extra = [] }: { seed?: string; version?: bigint; extra?: { account: Address; roleBitmap: bigint }[] } = {}): Promise<Address> {
  const salt = hashOf({ type: "bytes32", value: keccak256(stringToHex(seed)) }, { type: "address", value: account.address }, { type: "uint256", value: version })
  const data = encodeFunctionData({ abi: resolverAbi, functionName: "initialize", args: [[{ account: account.address, roleBitmap: ALL_ROLES }, ...extra], []] })
  return deploy(url, account, RESOLVER_IMPL, salt, data)
}

/** A name's own registry, which is what lets it hold subnames. */
export async function deployRegistry(url: string | undefined, account: Account, name: string, version = 0n): Promise<Address> {
  const salt = hashOf({ type: "bytes32", value: keccak256(stringToHex("UserRegistry")) }, { type: "bytes32", value: namehash(normalize(name)) }, { type: "uint256", value: version })
  const data = encodeFunctionData({ abi: registryAbi, functionName: "initialize", args: [[{ account: account.address, roleBitmap: ALL_ROLES }]] })
  return deploy(url, account, USER_REGISTRY_IMPL, salt, data)
}

export type ProberName = { label: string; address: Address }
export type ProberState = { nameRegistry?: Address; proberRegistry?: Address; probersName?: boolean; probers?: Record<string, Address> }

/**
 * Builds <label>.probers.<name>: the name gets a registry, "probers" gets its own, and each prober gets a subname with
 * its own resolver. The prober may write its text records and nothing else: the address that says who it is stays with
 * the owner. `save` runs after each step, so a rerun carries on where a failure stopped.
 */
export async function setupProbers(url: string | undefined, account: Account, name: string, resolver: Address, probers: ProberName[], state: ProberState, save: (state: ProberState) => Promise<void>, log: (text: string) => void, version = 0n) {
  const label = labelOf(name)
  const expiry = BigInt(Math.floor(Date.now() / 1000)) + ONE_YEAR
  if (!state.nameRegistry) {
    state.nameRegistry = await deployRegistry(url, account, name, version)
    await write(url, account, { address: ETH_REGISTRY, abi: registryAbi, functionName: "setSubregistry", args: [BigInt(labelhash(label)), state.nameRegistry] })
    await write(url, account, { address: state.nameRegistry, abi: registryAbi, functionName: "setParent", args: [ETH_REGISTRY, label] })
    await save(state)
    log(`${name} now has its own registry: ${state.nameRegistry}`)
  }
  if (!state.proberRegistry) {
    state.proberRegistry = await deployRegistry(url, account, `probers.${name}`, version)
    await save(state)
  }
  if (!state.probersName) {
    await write(url, account, { address: state.nameRegistry, abi: registryAbi, functionName: "register", args: ["probers", account.address, state.proberRegistry, resolver, SUBNAME_ROLES, expiry] })
    await write(url, account, { address: state.proberRegistry, abi: registryAbi, functionName: "setParent", args: [state.nameRegistry, "probers"] })
    state.probersName = true
    await save(state)
    log(`probers.${name} registered: ${state.proberRegistry}`)
  }
  state.probers ??= {}
  for (const prober of probers) {
    if (state.probers[prober.label]) continue
    const own = await deployResolver(url, account, { seed: `ProberResolver:${prober.label}`, version, extra: [{ account: prober.address, roleBitmap: ROLE_SET_TEXT }] })
    await write(url, account, { address: state.proberRegistry, abi: registryAbi, functionName: "register", args: [prober.label, account.address, ZERO_ADDRESS, own, SUBNAME_ROLES, expiry] })
    const dns = toHex(packetToBytes(normalize(`${prober.label}.probers.${name}`)))
    await write(url, account, { address: own, abi: resolverAbi, functionName: "multicall", args: [[
      encodeFunctionData({ abi: resolverAbi, functionName: "setAddress", args: [dns, 60n, prober.address] }),
      encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dns, "arkiv.role", "prober"] }),
    ]] })
    state.probers[prober.label] = own
    await save(state)
    log(`${prober.label}.probers.${name} -> ${prober.address}`)
  }
  return state
}

/** Lets `to` write these text keys and no others. */
export async function delegateRecords(url: string | undefined, account: Account, resolver: Address, to: Address, keys: string[]) {
  for (const key of keys) {
    const setter = encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: ["0x", key, ""] })
    await write(url, account, { address: resolver, abi: resolverAbi, functionName: "grantSetterRoles", args: [setter, to] })
  }
}

/**
 * Moves control of a name to `owner`, usually a cold wallet or a multisig, and leaves this key only the listed text keys.
 * The new owner gets every role before this key gives any up, so a failure part-way cannot leave the name with nobody.
 */
export async function handOver(url: string | undefined, account: Account, name: string, resolver: Address, registries: Address[], owner: Address, keep: string[], log: (text: string) => void) {
  await delegateRecords(url, account, resolver, account.address, keep)
  log(`Kept ${keep.length} text keys for ${account.address}`)
  await write(url, account, { address: resolver, abi: resolverAbi, functionName: "grantRootRoles", args: [ALL_ROLES, owner] })
  for (const registry of registries) await write(url, account, { address: registry, abi: registryAbi, functionName: "grantRootRoles", args: [ALL_ROLES, owner] })
  log(`Granted every role to ${owner}`)
  const client = createPublicClient({ chain: sepolia, transport: http(url) })
  const id = BigInt(labelhash(labelOf(name)))
  const tokenId = await client.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getTokenId", args: [id] })
  await write(url, account, { address: ETH_REGISTRY, abi: registryAbi, functionName: "safeTransferFrom", args: [account.address, owner, tokenId, 1n, "0x"] })
  log(`Moved ${name} to ${owner}`)
  for (const registry of registries) await write(url, account, { address: registry, abi: registryAbi, functionName: "revokeRootRoles", args: [ALL_ROLES, account.address] })
  await write(url, account, { address: resolver, abi: resolverAbi, functionName: "revokeRootRoles", args: [ALL_ROLES, account.address] })
  log(`Gave up every other role`)
}

export async function registerName(url: string | undefined, account: Account, name: string, resolver: Address, log: (text: string) => void) {
  const { client, wallet } = clients(url, account)
  const quote = await ensQuote(url, account, name)
  if (!quote.available) throw new Error(`${name} is not available`)
  const { label, total } = quote
  const send = async (hash: Hex, step: string) => {
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== "success") throw new Error(`${step} failed: ${hash}`)
    log(`${step}: ${hash}`)
  }

  const balance = await client.readContract({ address: MOCK_USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] })
  if (balance < total) await send(await wallet.writeContract({ address: MOCK_USDC, abi: mintAbi, functionName: "mint", args: [account.address, total - balance] }), "Minted MockUSDC")
  await send(await wallet.writeContract({ address: MOCK_USDC, abi: erc20Abi, functionName: "approve", args: [ETH_REGISTRAR, total] }), "Approved the fee")

  const secret = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const commitment = await client.readContract({
    address: ETH_REGISTRAR, abi: registrarAbi, functionName: "makeCommitment",
    args: [label, account.address, secret, ZERO_ADDRESS, resolver, ONE_YEAR, ZERO_BYTES],
  })
  await send(await wallet.writeContract({ address: ETH_REGISTRAR, abi: registrarAbi, functionName: "commit", args: [commitment] }), "Committed")

  const age = await client.readContract({ address: ETH_REGISTRAR, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" })
  await Bun.sleep((Number(age) + 30) * 1000)
  await send(await wallet.writeContract({
    address: ETH_REGISTRAR, abi: registrarAbi, functionName: "register",
    args: [label, account.address, secret, ZERO_ADDRESS, resolver, ONE_YEAR, MOCK_USDC, ZERO_BYTES],
  }), "Registered")
}

/** Writes every record in one transaction, then reads them back the way a client would. */
export async function setRecords(url: string | undefined, account: Account, name: string, resolver: Address, records: Record<string, string>) {
  const { client, wallet } = clients(url, account)
  const ens = normalize(name)
  const dnsName = toHex(packetToBytes(ens))
  const calls = Object.entries(records).map(([key, value]) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsName, key, value] }))
  const hash = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: "multicall", args: [calls] })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`Setting records failed: ${hash}`)
  // A provider can answer from a block before this write, so give it a moment before calling a record unchanged.
  const readAll = async () => Object.fromEntries(await Promise.all(Object.keys(records).map(async (key) => [key, await client.getEnsText({ name: ens, key })])))
  let read = await readAll()
  for (let tries = 0; tries < 10 && Object.entries(records).some(([key, value]) => read[key] !== value); tries++) {
    await Bun.sleep(3_000)
    read = await readAll()
  }
  return { hash, read }
}
