// Turns one upstream chain file into attributes. The importer and Verify share this code, so Verify can rebuild every
// attribute from `raw` and catch a record whose attributes were changed. Browser-safe.
import { sha1 } from "@noble/hashes/legacy"
import { bytesToHex } from "@noble/hashes/utils"

const MAX_STR = 128
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The id `git hash-object` prints for these bytes. */
export function gitBlobId(bytes: Uint8Array): string {
  const header = encoder.encode(`blob ${bytes.length}\0`)
  const all = new Uint8Array(header.length + bytes.length)
  all.set(header)
  all.set(bytes, header.length)
  return bytesToHex(sha1(all))
}

/** Arkiv refuses strings over 128 bytes, so cut at a UTF-8 boundary. The full value stays in `raw`. */
export function fit(value: string): string {
  if (encoder.encode(value).length <= MAX_STR) return value
  let out = ""
  let used = 0
  for (const ch of value) {
    used += encoder.encode(ch).length
    if (used > MAX_STR) break
    out += ch
  }
  return out
}

export type ChainFile = {
  chainId: number
  shortName: string
  name: string
  chain?: string
  title?: string
  status?: string
  networkId?: number
  rpc?: string[]
  features?: { name: string }[]
  redFlags?: string[]
  parent?: { type?: string; chain?: string }
  nativeCurrency?: { name?: string; symbol?: string; decimals?: number }
  explorers?: { name?: string; url?: string; standard?: string }[]
  infoURL?: string
  icon?: string
}

export type ChainAttrs = {
  chainId: bigint
  shortName: string
  name: string
  chainFamily: string
  nativeSymbol: string
  nativeDecimals: number
  networkId: bigint
  status: string
  layer: string
  parentChainId?: bigint
  reusedChainId: boolean
  eip155: boolean
  eip1559: boolean
  eip4844: boolean
  eip7702: boolean
  sourceBlob: string
}

export function parseFile(raw: Uint8Array): ChainFile {
  return JSON.parse(decoder.decode(raw)) as ChainFile
}

export function parentId(file: ChainFile): bigint | undefined {
  const match = /^eip155-(\d+)$/.exec(file.parent?.chain ?? "")
  return match ? BigInt(match[1]!) : undefined
}

export function deriveChain(raw: Uint8Array): ChainAttrs {
  const file = parseFile(raw)
  const features = new Set((file.features ?? []).map((f) => f.name))
  const parent = parentId(file)
  return {
    chainId: BigInt(file.chainId),
    shortName: fit(file.shortName),
    name: fit(file.name),
    chainFamily: fit(file.chain ?? ""),
    nativeSymbol: fit(file.nativeCurrency?.symbol ?? ""),
    nativeDecimals: file.nativeCurrency?.decimals ?? 18,
    networkId: BigInt(file.networkId ?? file.chainId),
    status: file.status ?? "unset",
    layer: file.parent?.type ?? "L1",
    ...(parent === undefined ? {} : { parentChainId: parent }),
    reusedChainId: (file.redFlags ?? []).includes("reusedChainId"),
    eip155: features.has("EIP155"),
    eip1559: features.has("EIP1559"),
    eip4844: features.has("EIP4844"),
    eip7702: features.has("EIP7702"),
    sourceBlob: gitBlobId(raw),
  }
}

export type RpcAttrs = { chainId: bigint; url: string; protocol: string; needsApiKey: boolean; origin: string }

export function deriveRpcs(file: ChainFile): RpcAttrs[] {
  const seen = new Set<string>()
  const out: RpcAttrs[] = []
  for (const url of file.rpc ?? []) {
    if (typeof url !== "string" || !url || seen.has(url)) continue
    seen.add(url)
    out.push({
      chainId: BigInt(file.chainId),
      url: fit(url),
      protocol: url.split(":")[0]!.toLowerCase(),
      needsApiKey: url.includes("${"),
      origin: "list",
    })
  }
  return out
}

export type ExplorerAttrs = { chainId: bigint; name: string; standard: string; url: string }

export function deriveExplorers(file: ChainFile): ExplorerAttrs[] {
  const seen = new Set<string>()
  const out: ExplorerAttrs[] = []
  for (const e of file.explorers ?? []) {
    if (!e.url || seen.has(e.url)) continue
    seen.add(e.url)
    out.push({ chainId: BigInt(file.chainId), name: fit(e.name ?? ""), standard: fit(e.standard ?? "none"), url: fit(e.url) })
  }
  return out
}

/** Reasons a file breaks our assumptions. They are reported, never used to drop the file. */
export function validate(file: ChainFile): string[] {
  const problems: string[] = []
  if (!Number.isSafeInteger(file.chainId) || file.chainId < 0) problems.push("chainId is not a safe integer")
  if (typeof file.shortName !== "string" || !file.shortName) problems.push("shortName missing")
  if (typeof file.name !== "string" || !file.name) problems.push("name missing")
  for (const url of file.rpc ?? []) if (fit(url) !== url) problems.push(`RPC URL over 128 bytes: ${url.slice(0, 40)}`)
  return problems
}
