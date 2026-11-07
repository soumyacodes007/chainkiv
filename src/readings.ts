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
  /** Seconds, from the head block. Version 1 readings don't have it. */
  blockTime?: bigint | number
}

/** A head older than this is not keeping up, however fast the RPC answers. */
export const MAX_HEAD_AGE_SECONDS = 3600
/** Further behind the best head than any healthy node would be. */
export const MAX_LAG_BLOCKS = 1000

/** Zero or missing means the block time isn't known, so it can't count against the RPC. */
export function isStaleHead(r: { blockTime?: bigint | number; checkedAt: bigint | number; lagBlocks?: number }) {
  const time = Number(r.blockTime ?? 0)
  return (time > 0 && Number(r.checkedAt) - time > MAX_HEAD_AGE_SECONDS) || (r.lagBlocks ?? 0) >= MAX_LAG_BLOCKS
}

/** The exact text a prober signs. Everything a reader relies on is in it. */
export function readingText(r: SignedFields): string {
  const shared = [r.chainId, r.url, r.up, r.chainIdOk, r.genesis, r.latencyMs, r.lagBlocks, r.checkedAt, r.blockNumber, r.blockHash, r.genesisSeen]
  // Version 2 adds the block time. Version 1 stays readable, so a reading from an older prober still verifies.
  return (r.blockTime === undefined ? ["chainkiv/health/1", ...shared] : ["chainkiv/health/2", ...shared, r.blockTime]).join("|")
}

export const signerOf = (fields: SignedFields, sig: Hex): Promise<string> => recoverMessageAddress({ message: readingText(fields), signature: sig })
