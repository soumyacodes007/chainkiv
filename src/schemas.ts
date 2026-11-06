// Every entity ChainKiv writes. Attribute names are the ones listed in arkiv/schema.md.
import { bool, bytes, dec, defineSchema, i32, key, str, u64 } from "@arkiv-network/sdk/schema"

export const Chain = defineSchema("chainkiv.chain", {
  chainId: u64().indexed(),
  shortName: str().indexed(),
  name: str().indexed(),
  chainFamily: str().indexed(),
  nativeSymbol: str().indexed(),
  nativeDecimals: i32().indexed(),
  networkId: u64().indexed(),
  status: str().indexed(),
  layer: str().indexed(),
  parentChainId: u64().indexed().optional(),
  reusedChainId: bool().indexed(),
  conflict: bool().indexed(),
  eip155: bool().indexed(),
  eip1559: bool().indexed(),
  eip4844: bool().indexed(),
  eip7702: bool().indexed(),
  sourceBlob: str().indexed(),
  sourceCommit: str(),
  raw: bytes(),
})

export const Rpc = defineSchema("chainkiv.rpc", {
  chainId: u64().indexed(),
  url: str().indexed(),
  protocol: str().indexed(),
  needsApiKey: bool().indexed(),
  origin: str().indexed(),
})

export const Explorer = defineSchema("chainkiv.explorer", {
  chainId: u64().indexed(),
  name: str().indexed(),
  standard: str().indexed(),
  url: str(),
})

export const RpcHealth = defineSchema("chainkiv.rpcHealth", {
  chainId: u64().indexed(),
  url: str().indexed(),
  region: str().indexed(),
  up: bool().indexed(),
  chainIdOk: bool().indexed(),
  genesis: str().indexed(),
  latencyMs: i32().indexed(),
  lagBlocks: i32().indexed(),
  checkedAt: u64().indexed(),
  blockNumber: u64(),
  blockHash: str(),
  genesisSeen: str(),
  error: str(),
  proberVersion: str(),
  sig: bytes(),
})

export const RpcStats = defineSchema("chainkiv.rpcStats", {
  chainId: u64().indexed(),
  url: str().indexed(),
  uptime24h: dec().indexed(),
  uptime7d: dec().indexed(),
  p50Ms: i32().indexed(),
  p95Ms: i32(),
  samples24h: i32(),
})

export const Release = defineSchema("chainkiv.release", {
  releaseNo: u64().indexed(),
  commit: str().indexed(),
  merkleRoot: str().indexed(),
  chainCount: u64(),
  metaHash: str(),
  anchorNetwork: str(),
  anchorTx: str().optional(),
})

export const Manifest = defineSchema("chainkiv.manifest", {
  merkleRoot: str().indexed(),
  part: i32().indexed(),
  parts: i32(),
  data: bytes(),
})

export const ReleaseMeta = defineSchema("chainkiv.releaseMeta", {
  metaHash: str().indexed(),
  data: bytes(),
})

export const Proposal = defineSchema("chainkiv.proposal", {
  kind: str().indexed(),
  targetChainId: u64().indexed(),
  shortName: str().indexed(),
  note: str(),
  raw: bytes(),
})

export const Review = defineSchema("chainkiv.review", {
  proposalKey: key().indexed(),
  verdict: str().indexed(),
  targetChainId: u64().indexed(),
  reasons: str(),
})
