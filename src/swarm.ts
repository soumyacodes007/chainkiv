// A release's copy on Swarm. A bundle holds what's needed to rebuild the signed root, so a copy proves itself: anyone can
// fetch it and compare it with Ethereum, with no trust in Swarm or in us. Browser-safe.
import { merkleRoot, type Leaf } from "./release"
import type { Trust } from "./trust"

const FORMAT = "chainroll/release/1"
export const SWARM_GATEWAY = "https://api.gateway.ethswarm.org"
export const SWARM_BEE = "http://localhost:1633"
/** The only stamp the tools will spend. Nook keeps its own, and that one is not ours to use. */
export const STAMP_LABEL = "chainroll"
export const isReference = (text: string) => /^[0-9a-f]{64}(?:[0-9a-f]{64})?$/i.test(text)
export const copyLink = (reference: string, gateway = SWARM_GATEWAY) => `${gateway}/bzz/${reference}/`

type Anchor = { releaseNo: string; commit: string; root: string; chainCount: number; metaHash: string }
type Bundle = Anchor & { format: string; anchorTx: string; publisher: string; ens: string; meta: unknown; leaves: [string, string, string][] }

/** Refuses a release that doesn't rebuild the root signed on Ethereum. */
export function encodeBundle(anchor: Anchor, leaves: Leaf[], trust: Pick<Trust, "publisher" | "source"> & { anchorTx: string }, meta: unknown): string {
  if (merkleRoot(leaves) !== anchor.root) throw new Error("The release on Arkiv doesn't rebuild the signed root")
  const bundle: Bundle = { format: FORMAT, ...anchor, anchorTx: trust.anchorTx, publisher: trust.publisher, ens: trust.source, meta, leaves: leaves.map((l) => [l.chainId.toString(), l.shortName, l.sourceBlob]) }
  return JSON.stringify(bundle)
}

export function verifyBundle(text: string, root: string): { ok: boolean; detail: string } {
  try {
    const bundle = JSON.parse(text) as Bundle
    if (bundle.format !== FORMAT) return { ok: false, detail: "This isn't a Chainroll release" }
    const leaves = bundle.leaves.map(([chainId, shortName, sourceBlob]) => ({ chainId: BigInt(chainId), shortName, sourceBlob }))
    if (bundle.root !== root || merkleRoot(leaves) !== root) return { ok: false, detail: "This copy doesn't rebuild the signed root" }
    return { ok: true, detail: `${leaves.length.toLocaleString("en")} chains rebuild the signed root` }
  } catch {
    return { ok: false, detail: "This file couldn't be read as a release" }
  }
}

/** Reads a copy back and rebuilds it, so a reference is never taken on trust. */
export async function checkCopy(reference: string, root: string, gateway = SWARM_GATEWAY): Promise<{ ok: boolean; detail: string }> {
  const response = await fetch(copyLink(reference, gateway), { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (!response) return { ok: false, detail: "The Swarm gateway didn't answer" }
  if (!response.ok) return { ok: false, detail: response.status === 404 ? "Swarm can't find this yet" : `The Swarm gateway answered ${response.status}` }
  return verifyBundle(await response.text(), root)
}
