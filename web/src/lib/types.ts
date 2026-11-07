import type { ChainFile } from "../../../src/derive"

export type Verdict = "passed" | "unconfirmed" | "wrong-chain" | "wrong-genesis" | "stale" | "down" | "rate-limited" | "needs-key" | "refused"

/** One measurement of one RPC, from a signed prober reading or from a survey run. */
export type Reading = {
  prober: string
  region: string
  up: boolean
  chainIdOk: boolean
  genesis: string
  latencyMs: number
  lagBlocks: number
  checkedAt: number
  blockNumber: string
  blockHash: string
  genesisSeen: string
  blockTime?: number
  error: string
  verdict?: Verdict
  outcome?: string
}

export type RpcRow = { url: string; protocol: string; needsApiKey: boolean; origin: string; readings: Reading[] }
export type ExplorerRow = { name: string; url: string; standard: string }

export type ChainRow = {
  id: string
  name: string
  short: string
  symbol: string
  layer: string
  status: string
  parent?: string
  family: string
  reused: boolean
  conflict: boolean
  testnet: boolean
  sourceBlob?: string
  rpcs: RpcRow[]
  explorers: ExplorerRow[]
  file?: ChainFile & { faucets?: string[]; slip44?: number }
}

export type SurveyInfo = {
  at: string
  commit: string
  seconds: number
  genesis?: Record<string, { hash: string | null; votes: number; voters: number }>
  summary: { total: number; counts: Record<string, number>; reasons: Record<string, number>; chainsProbed: number; chainsWithNoPassingRpc: number }
}

export type Snapshot = {
  builtAt: string
  upstream: { source: string; count: number; commit: string | null }
  survey: SurveyInfo | null
  chains: ChainFile[]
  readings: Record<string, [Verdict, number, number, string, string, string, number, string, string]>
}
