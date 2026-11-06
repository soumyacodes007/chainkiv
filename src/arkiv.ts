// Arkiv clients and paged reads. Browser-safe. Access keys travel in the RPC URL, so URLs are never logged.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { asc, gt } from "@arkiv-network/sdk/query"
import { key } from "@arkiv-network/sdk/schema"
import { defineChain, http, type Account, type Chain as ViemChain, type Hex } from "viem"

export type Network = { chain: ViemChain; url: string; name: string }

export const LOCAL_CHAIN_ID = 1337

export function rabdiNetwork(accessKey = ""): Network {
  const chain = rabdi({ accessKey })
  return { chain, url: chain.rpcUrls.default.http[0]!, name: "rabdi" }
}

export function localNetwork(url: string): Network {
  const chain = defineChain({
    id: LOCAL_CHAIN_ID,
    name: "local",
    nativeCurrency: { name: "GLM", symbol: "GLM", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  })
  return { chain, url, name: "local" }
}

// viem's defaults wait out Arkiv's long Retry-After, which looks like a hang (see friction.md).
const transport = (url: string) => http(url, { retryCount: 0, timeout: 30_000 })

export const reader = (network: Network): any => createPublicClient({ chain: network.chain, transport: transport(network.url), pollingInterval: 500 })

export const writer = (network: Network, account: Account): any =>
  createWalletClient({ chain: network.chain, transport: transport(network.url), account, pollingInterval: 500 })

type ReadOptions = { schema: unknown; owner?: string; where?: unknown; select?: Record<string, true> }

/** Reads every match exactly once by paging on `$key`, which is safe while others write. */
export async function readAll<T = any>(client: any, { schema, owner, where, select }: ReadOptions): Promise<T[]> {
  const rows: T[] = []
  let last: Hex | undefined
  for (;;) {
    let query = (select ? client.select({ $key: true, ...select }) : client.select()).from(schema)
    const filters = [where, last ? gt("$key", key(last)) : undefined].filter(Boolean)
    if (filters.length === 1) query = query.where(filters[0])
    else if (filters.length === 2) {
      const { and } = await import("@arkiv-network/sdk/query")
      query = query.where(and(filters[0] as never, filters[1] as never))
    }
    if (owner) query = query.ownedBy(owner)
    const page = await query.orderBy(asc("$key")).limit(100).fetch({ onMismatch: "throw" })
    rows.push(...page.entities)
    if (page.entities.length < 100) return rows
    last = page.entities[page.entities.length - 1].$key
  }
}

/** Attribute values come back as `{ type, value }`. */
export const val = <T = any>(attribute: { value: T } | undefined): T | undefined => attribute?.value

export const toBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value
  if (typeof value === "string") {
    const hex = value.startsWith("0x") ? value.slice(2) : value
    return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16))
  }
  throw new Error("expected bytes")
}
