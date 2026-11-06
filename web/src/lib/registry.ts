// Everything that talks to Arkiv and Ethereum. Reads go through the shared client library in src/.
import { rabdi } from "@arkiv-network/sdk/chains"
import { eq } from "@arkiv-network/sdk/query"
import { u64 } from "@arkiv-network/sdk/schema"
import { createPublicClient, http } from "viem"
import { mainnet, sepolia } from "viem/chains"
import { readAll, val, type Network } from "../../../src/arkiv"
import { createRegistry, type Registry, type Trust } from "../../../src/client"
import { Chain, Explorer, Proposal, Review, Rpc } from "../../../src/schemas"
import { upstreamFromGitHub } from "../../../src/verify"
import { readAnchor, trustFromEns } from "../../../src/trust"
import type { Step, Verdict } from "../../../src/verify"
import type { ChainRow, ExplorerRow, RpcRow } from "./types"

const env = import.meta.env
const ENS = env.VITE_CHAINKIV_ENS as string | undefined
const PUBLISHER = env.VITE_CHAINKIV_PUBLISHER as string | undefined
export const VALIDATOR = (env.VITE_CHAINKIV_VALIDATOR as string | undefined) || ""
const ANCHOR_TX = env.VITE_CHAINKIV_ANCHOR_TX as string | undefined
export const ETH_NETWORK = (env.VITE_ETH_NETWORK as string | undefined) || "sepolia"
export const ETH_EXPLORER = ETH_NETWORK === "mainnet" ? "https://etherscan.io" : "https://sepolia.etherscan.io"

const chain = rabdi({ accessKey: "" })
const network: Network = { chain, url: env.VITE_ARKIV_PROXY ? `${location.origin}/arkiv-rpc` : chain.rpcUrls.default.http[0]!, name: "rabdi" }
const ethChain = ETH_NETWORK === "mainnet" ? mainnet : sepolia
const ethereumAt = (url?: string) => createPublicClient({ chain: ethChain, transport: http(url, { retryCount: 1, timeout: 20_000 }) }) as any
// Named on purpose: viem's default Sepolia endpoint rate limits, and two separate companies are what make the check below mean anything.
const [FIRST, SECOND] = ETH_NETWORK === "mainnet" ? ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"] : ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"]
const ethereum = ethereumAt((env.VITE_ETH_RPC_URL as string | undefined) || FIRST)
/** A second provider, because an Ethereum RPC is the one party that could lie about both ENS and the anchor. */
const second = ethereumAt(SECOND)

/** Ethereum couldn't name the publisher. Arkiv may be fine, so this is reported separately. */
export class TrustFailure extends Error {}

export const hasPublisher = !!(ENS || PUBLISHER)
export const publisherName = ENS || ""

async function trust(): Promise<Trust> {
  if (ENS) {
    const [first, other] = await Promise.allSettled([trustFromEns(ethereum, ENS), trustFromEns(second, ENS)])
    const one = first.status === "fulfilled" ? first.value : other.status === "fulfilled" ? other.value : null
    if (!one) throw (first as PromiseRejectedResult).reason
    const two = first.status === "fulfilled" && other.status === "fulfilled" ? other.value : null
    if (two && (two.publisher.toLowerCase() !== one.publisher.toLowerCase() || two.anchorTx !== one.anchorTx)) throw new Error("Two Ethereum providers disagree about the publisher, so neither is trusted")
    return one
  }
  if (!PUBLISHER) throw new Error("No publisher set yet: the ENS name has not been configured")
  return { publisher: PUBLISHER, anchorTx: ANCHOR_TX ?? "", source: "this site's settings" }
}

/** GitHub allows 60 calls an hour per network without a login, and a commit on main stays there, so each browser asks once. */
async function upstream(commit: string) {
  const key = `chainkiv.upstream.${commit}`
  try {
    const saved = localStorage.getItem(key)
    if (saved) return JSON.parse(saved) as Awaited<ReturnType<typeof upstreamFromGitHub>>
  } catch {}
  const result = await upstreamFromGitHub(commit)
  try {
    if (result.onMain) localStorage.setItem(key, JSON.stringify(result))
  } catch {}
  return result
}

export const reg: Registry = createRegistry({
  network,
  trust,
  upstream,
  readAnchor: async (tx) => {
    if (!tx) throw new Error("No release has been anchored on Ethereum yet")
    return readAnchor(ethereum, tx as `0x${string}`).catch(() => readAnchor(second, tx as `0x${string}`))
  },
})

const TESTNET = /test|sepolia|goerli|holesky|hoodi|devnet|rinkeby|ropsten|kovan|mumbai|amoy|fuji|chapel|ganache|katana|tucana|kanazawa/i
/** Names, short names and titles only. Having a faucet doesn't make a chain a testnet: Gnosis has one. */
export const isTestnet = (...text: (string | undefined)[]) => text.some((t) => t && !/mainnet/i.test(t) && TESTNET.test(t))

const SELECT = { chainId: true, name: true, shortName: true, chainFamily: true, nativeSymbol: true, status: true, layer: true, parentChainId: true, reusedChainId: true, conflict: true, sourceBlob: true } as const

/** All publisher records, without the raw files. Returns [] if the publisher has written nothing yet. */
export async function readDirectory(onProgress?: (n: number) => void): Promise<ChainRow[]> {
  const { publisher } = await reg.trust().catch((e) => {
    throw new TrustFailure((e as Error).message)
  })
  const rows = await readAll<any>(reg.client, { schema: Chain, owner: publisher, select: SELECT })
  onProgress?.(rows.length)
  if (!rows.length) return []
  const rpcs = await readAll<any>(reg.client, { schema: Rpc, owner: publisher })
  const byChain = new Map<string, RpcRow[]>()
  const seen = new Set<string>()
  for (const r of rpcs) {
    const id = String(val(r.chainId))
    const unique = `${id}|${val(r.url)}`
    if (seen.has(unique)) continue
    seen.add(unique)
    if (!byChain.has(id)) byChain.set(id, [])
    byChain.get(id)!.push({ url: val(r.url)!, protocol: val(r.protocol)!, needsApiKey: val(r.needsApiKey)!, origin: val(r.origin)!, readings: [] })
  }
  return rows.map((r) => {
    const id = String(val(r.chainId))
    const name = val<string>(r.name)!
    const parent = val<bigint>(r.parentChainId)
    return {
      id,
      name,
      short: val<string>(r.shortName)!,
      symbol: val<string>(r.nativeSymbol)!,
      layer: val<string>(r.layer)!,
      status: val<string>(r.status)!,
      parent: parent === undefined ? undefined : String(parent),
      family: val<string>(r.chainFamily)!,
      reused: val<boolean>(r.reusedChainId)!,
      conflict: !!val(r.conflict),
      testnet: isTestnet(name),
      sourceBlob: val<string>(r.sourceBlob),
      rpcs: byChain.get(id) ?? [],
      explorers: [],
    }
  })
}

export async function readExplorers(id: string): Promise<ExplorerRow[]> {
  const publisher = (await reg.trust()).publisher
  const rows = await readAll<any>(reg.client, { schema: Explorer, owner: publisher, where: eq("chainId", u64(BigInt(id))) })
  return rows.map((r) => ({ name: val(r.name)!, url: val(r.url)!, standard: val(r.standard)! }))
}

const STEPS: [string, Step["group"], string][] = [
  ["publisher", "publisher", "Publisher named on Ethereum"],
  ["anchor", "publisher", "Release signed by the publisher"],
  ["manifest", "data", "Release contents match the signature"],
  ["file", "data", "Record is the upstream file"],
  ["attributes", "data", "Attributes match the file"],
  ["proof", "data", "Merkle proof reaches the signed root"],
  ["upstream", "data", "Commit is in the upstream main branch"],
]

/** Always seven steps, in the PRD's order. A step that could not run says so. */
export async function runVerify(id: string): Promise<Verdict> {
  let verdict: Verdict
  try {
    verdict = await reg.verify(BigInt(id))
  } catch (e) {
    verdict = { ok: false, state: "incomplete", steps: [{ id: "publisher", group: "publisher", label: STEPS[0]![2], status: "not-run", detail: (e as Error).message.split("\n")[0]!.slice(0, 160) }] }
  }
  const steps = STEPS.map(([sid, group, label]) => verdict.steps.find((s) => s.id === sid) ?? { id: sid, group, label, status: "not-run" as const, detail: "An earlier step has to pass first" })
  // PRD edge 24: nothing passes without ENS. A publisher from this site's own settings proves nothing.
  if (!ENS) {
    const first = steps[0]!
    steps[0] = { ...first, status: "not-run", detail: "The ENS name isn't set yet, so nothing on Ethereum names the publisher" }
    if (verdict.state === "verified") return { ...verdict, ok: false, state: "incomplete", steps }
  }
  return { ...verdict, steps }
}

export type ProposalRow = { key: string; owner: string; kind: string; target: string; shortName: string; note: string; verdict: string; reasons: string }

/** One page of proposals and their reviews. A review counts only from the validator. */
export async function readProposals(): Promise<ProposalRow[]> {
  const page = await reg.client.select().from(Proposal).limit(100).fetch({ onMismatch: "skip" })
  const reviews = VALIDATOR ? await readAll<any>(reg.client, { schema: Review, owner: VALIDATOR }) : []
  const verdicts = new Map(reviews.map((r) => [String(val(r.proposalKey)), r]))
  return page.entities.map((p: any) => {
    const review = verdicts.get(p.$key)
    return {
      key: p.$key,
      owner: p.$owner,
      kind: val(p.kind)!,
      target: String(val(p.targetChainId)),
      shortName: val(p.shortName)!,
      note: val(p.note) ?? "",
      verdict: review ? val<string>(review.verdict)! : "unreviewed",
      reasons: review ? (val<string>(review.reasons) ?? "") : "",
    } as ProposalRow
  })
}

export type { Verdict, Step }
