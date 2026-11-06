// What a prober signs, split from the probe itself so browsers can check readings. Browser-safe.
import { recoverMessageAddress, type Hex } from "viem"

export type SignedFields = {
  chainId: bigint
  url: string
  up: boolean
  chainIdOk: boolean
  genesis: string
  latencyMs: number
  lagBlocks: number
  checkedAt: bigint
  blockNumber: bigint
  blockHash: string
  genesisSeen: string
}

/** The exact text a prober signs. Everything a reader relies on is in it. */
export function readingText(r: SignedFields): string {
  return ["chainkiv/health/1", r.chainId, r.url, r.up, r.chainIdOk, r.genesis, r.latencyMs, r.lagBlocks, r.checkedAt, r.blockNumber, r.blockHash, r.genesisSeen].join("|")
}

export const signerOf = (fields: SignedFields, sig: Hex): Promise<string> => recoverMessageAddress({ message: readingText(fields), signature: sig })
