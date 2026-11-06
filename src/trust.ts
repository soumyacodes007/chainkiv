// Answers two questions from Ethereum, never from Arkiv: who is the publisher, and which release is the latest.
// Browser-safe.
import { createPublicClient, createWalletClient, http, type Account, type Chain as ViemChain, type Hex } from "viem"
import { mainnet, sepolia } from "viem/chains"
import { normalize } from "viem/ens"
import { decodeAnchor, encodeAnchor, type Anchor } from "./release"

export type Prober = { name: string; address: string }
export type Trust = { publisher: string; anchorTx: Hex; source: string; root?: string; probers?: Prober[] }

/** `arkiv.probers` lists ENS names. Each must resolve to an address, so an entry that stops resolving stops counting. */
export const proberNames = (record: string | null | undefined) => (record ?? "").split(",").map((n) => n.trim()).filter(Boolean)

export const ethereumChain = (name: string): ViemChain => (name === "mainnet" ? mainnet : sepolia)

export const ethereumReader = (chain: ViemChain, url?: string): any => createPublicClient({ chain, transport: http(url, { retryCount: 1, timeout: 20_000 }) })

/** Reads the ENS text records. A missing record is an error: nothing passes without a publisher. */
export async function trustFromEns(client: any, name: string): Promise<Trust> {
  const ens = normalize(name)
  const [publisher, anchorTx, root, listed] = await Promise.all([
    client.getEnsText({ name: ens, key: "arkiv.publisher" }),
    client.getEnsText({ name: ens, key: "arkiv.latestAnchor" }),
    client.getEnsText({ name: ens, key: "arkiv.root" }).catch(() => null),
    client.getEnsText({ name: ens, key: "arkiv.probers" }).catch(() => null),
  ])
  if (!publisher) throw new Error(`${name} has no arkiv.publisher record`)
  if (!anchorTx) throw new Error(`${name} has no arkiv.latestAnchor record`)
  const resolved = await Promise.all(proberNames(listed).map(async (prober) => ({ name: prober, address: await client.getEnsAddress({ name: normalize(prober) }).catch(() => null) as string | null })))
  const probers = resolved.filter((p): p is Prober => !!p.address)
  return { publisher, anchorTx: anchorTx as Hex, source: name, ...(root ? { root } : {}), ...(probers.length ? { probers } : {}) }
}

/** Reads an anchor. The sender is whatever the chain says, so the caller compares it with the publisher. */
export async function readAnchor(client: any, tx: Hex): Promise<{ anchor: Anchor | null; from: string; blockNumber: bigint }> {
  const found = await client.getTransaction({ hash: tx })
  return { anchor: decodeAnchor(found.input), from: found.from, blockNumber: found.blockNumber }
}

export async function sendAnchor(chain: ViemChain, url: string | undefined, account: Account, anchor: Anchor): Promise<Hex> {
  const wallet = createWalletClient({ chain, transport: http(url), account })
  const client = createPublicClient({ chain, transport: http(url) })
  const hash = await wallet.sendTransaction({ to: account.address, value: 0n, data: encodeAnchor(anchor) })
  await client.waitForTransactionReceipt({ hash })
  return hash
}
