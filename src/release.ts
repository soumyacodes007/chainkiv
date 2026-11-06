// The release: leaves, Merkle root, manifest and the anchor payload. Depends only on the commit's files, so anyone
// can rebuild the same root. Browser-safe.
import { StandardMerkleTree } from "@openzeppelin/merkle-tree"
import { bytesToHex, hexToBytes, keccak256, stringToBytes, type Hex } from "viem"

export const LEAF_ENCODING = ["uint64", "string", "bytes20"]
const MANIFEST_CHUNK = 100_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type Leaf = { chainId: bigint; shortName: string; sourceBlob: string }

const sorted = (leaves: Leaf[]) => [...leaves].sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0))
const tuple = (l: Leaf) => [l.chainId.toString(), l.shortName, `0x${l.sourceBlob}`]

export function buildTree(leaves: Leaf[]) {
  return StandardMerkleTree.of(sorted(leaves).map(tuple), LEAF_ENCODING)
}

export function merkleRoot(leaves: Leaf[]): Hex {
  return buildTree(leaves).root as Hex
}

const proofTrees = new WeakMap<Leaf[], { tree: ReturnType<typeof buildTree>; index: Map<string, number> }>()

/** Checks one leaf against a root, using a proof computed from the manifest. Builds the tree once per manifest. */
export function proveLeaf(leaves: Leaf[], leaf: Leaf, root: string): boolean {
  let cached = proofTrees.get(leaves)
  if (!cached) {
    const tree = buildTree(leaves)
    const index = new Map<string, number>()
    for (const [i, entry] of tree.entries()) index.set(entry.join("|"), i)
    cached = { tree, index }
    proofTrees.set(leaves, cached)
  }
  const value = tuple(leaf)
  const position = cached.index.get(value.join("|"))
  return position !== undefined && StandardMerkleTree.verify(root, LEAF_ENCODING, value, cached.tree.getProof(position))
}

/** One line per chain: `chainId,blob,shortName`. Short names go last because they are the only free text. */
export function encodeManifest(leaves: Leaf[]): Uint8Array[] {
  const text = sorted(leaves).map((l) => `${l.chainId},${l.sourceBlob},${l.shortName}`).join("\n")
  const bytes = encoder.encode(text)
  const parts: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += MANIFEST_CHUNK) parts.push(bytes.slice(i, i + MANIFEST_CHUNK))
  return parts
}

export function decodeManifest(parts: Uint8Array[]): Leaf[] {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const all = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return decoder.decode(all).split("\n").map((line) => {
    const first = line.indexOf(",")
    const second = line.indexOf(",", first + 1)
    return { chainId: BigInt(line.slice(0, first)), sourceBlob: line.slice(first + 1, second), shortName: line.slice(second + 1) }
  })
}

/** Facts that do not come from git, so they are covered by the anchor instead of the root. */
export type ReleaseMeta = { v: 1; probers: string[]; genesis: Record<string, string> }

export function encodeMeta(meta: ReleaseMeta): Uint8Array {
  const genesis = Object.fromEntries(Object.entries(meta.genesis).sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1)))
  const probers = [...meta.probers].map((p) => p.toLowerCase()).sort()
  return stringToBytes(JSON.stringify({ v: 1, probers, genesis }))
}

export const metaHash = (encoded: Uint8Array): Hex => keccak256(encoded)

export type Anchor = { releaseNo: string; commit: string; root: string; chainCount: number; metaHash: string }

const ANCHOR_PREFIX = "chainkiv/1 "

/** Calldata is readable text, so the release can be read straight from a block explorer. */
export function encodeAnchor(anchor: Anchor): Hex {
  return bytesToHex(stringToBytes(ANCHOR_PREFIX + JSON.stringify(anchor)))
}

export function decodeAnchor(data: Hex): Anchor | null {
  try {
    const text = decoder.decode(hexToBytes(data))
    if (!text.startsWith(ANCHOR_PREFIX)) return null
    const a = JSON.parse(text.slice(ANCHOR_PREFIX.length)) as Anchor
    return typeof a.root === "string" && typeof a.commit === "string" ? a : null
  } catch {
    return null
  }
}
