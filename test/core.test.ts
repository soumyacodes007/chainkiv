import { describe, expect, test } from "bun:test"
import { deriveChain, deriveExplorers, deriveRpcs, fit, gitBlobId, parseFile, validate } from "../src/derive"
import { buildTree, decodeAnchor, decodeManifest, encodeAnchor, encodeManifest, encodeMeta, merkleRoot, metaHash, proveLeaf, type Leaf } from "../src/release"
import { isPrivateAddress, pool } from "../src/probe"
import { readingText, signerOf } from "../src/readings"
import { agreeGenesis, verdictOf } from "../src/survey"
import type { Reading } from "../src/probe"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const base = {
  name: "Test Chain",
  chain: "TST",
  chainId: 8453,
  shortName: "tst",
  networkId: 8453,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpc: ["https://a.example", "wss://a.example", "https://b.example/${KEY}", "https://a.example"],
  features: [{ name: "EIP155" }, { name: "EIP1559" }],
  parent: { type: "L2", chain: "eip155-1" },
  explorers: [{ name: "scan", url: "https://scan.example", standard: "EIP3091" }],
}

describe("derive", () => {
  test("blob id matches git", () => {
    expect(gitBlobId(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a")
  })

  test("attributes come from the file", () => {
    const attrs = deriveChain(bytes(base))
    expect(attrs.chainId).toBe(8453n)
    expect(attrs.layer).toBe("L2")
    expect(attrs.parentChainId).toBe(1n)
    expect(attrs.eip1559).toBe(true)
    expect(attrs.eip4844).toBe(false)
    expect(attrs.status).toBe("unset")
  })

  test("a chain above the i32 range keeps its exact ID", () => {
    expect(deriveChain(bytes({ ...base, chainId: 2716446429837001 })).chainId).toBe(2716446429837001n)
  })

  test("RPCs are deduplicated and API-key URLs are marked", () => {
    const rpcs = deriveRpcs(parseFile(bytes(base)))
    expect(rpcs.map((r) => r.url)).toEqual(["https://a.example", "wss://a.example", "https://b.example/${KEY}"])
    expect(rpcs[1]!.protocol).toBe("wss")
    expect(rpcs[2]!.needsApiKey).toBe(true)
    expect(deriveExplorers(parseFile(bytes(base)))).toHaveLength(1)
  })

  test("long strings are cut on a character boundary", () => {
    const cut = fit("é".repeat(100))
    expect(new TextEncoder().encode(cut).length).toBeLessThanOrEqual(128)
    expect(cut).toBe("é".repeat(64))
  })

  test("a bad file is reported", () => {
    expect(validate({ ...base, chainId: -1 } as never)).toContain("chainId is not a safe integer")
  })
})

describe("release", () => {
  const leaves: Leaf[] = [
    { chainId: 8453n, shortName: "base", sourceBlob: "a".repeat(40) },
    { chainId: 1n, shortName: "eth,weird", sourceBlob: "b".repeat(40) },
    { chainId: 10n, shortName: "oeth", sourceBlob: "c".repeat(40) },
  ]

  test("root does not depend on input order", () => {
    expect(merkleRoot(leaves)).toBe(merkleRoot([...leaves].reverse()))
  })

  test("any changed field changes the root", () => {
    const changed = leaves.map((l, i) => (i ? l : { ...l, sourceBlob: "d".repeat(40) }))
    expect(merkleRoot(changed)).not.toBe(merkleRoot(leaves))
  })

  test("manifest survives encoding, including chunk boundaries", () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ chainId: BigInt(i), shortName: `name-${i}`, sourceBlob: "e".repeat(40) }))
    const parts = encodeManifest(many)
    expect(parts.length).toBeGreaterThan(1)
    expect(merkleRoot(decodeManifest(parts))).toBe(merkleRoot(many))
    expect(decodeManifest(encodeManifest(leaves)).find((l) => l.chainId === 1n)!.shortName).toBe("eth,weird")
  })

  test("a leaf proves against its root, and a forged leaf does not", () => {
    const root = merkleRoot(leaves)
    expect(proveLeaf(leaves, leaves[0]!, root)).toBe(true)
    expect(proveLeaf(leaves, { ...leaves[0]!, sourceBlob: "f".repeat(40) }, root)).toBe(false)
    expect(proveLeaf(leaves, leaves[0]!, buildTree(leaves.slice(1)).root)).toBe(false)
  })

  test("anchor round-trips and refuses other data", () => {
    const anchor = { releaseNo: "3", commit: "abc", root: "0x01", chainCount: 2855, metaHash: "0x02" }
    expect(decodeAnchor(encodeAnchor(anchor))).toEqual(anchor)
    expect(decodeAnchor("0x1234")).toBeNull()
  })

  test("meta hash ignores ordering and address case", () => {
    const one = encodeMeta({ v: 1, probers: ["0xAB", "0xcd"], genesis: { "10": "0x1", "2": "0x2" } })
    const two = encodeMeta({ v: 1, probers: ["0xcd", "0xab"], genesis: { "2": "0x2", "10": "0x1" } })
    expect(metaHash(one)).toBe(metaHash(two))
  })
})

describe("probe", () => {
  test("private addresses are refused", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false)
  })

  test("the pool never exceeds the per-host limit", async () => {
    const live = new Map<string, number>()
    let worst = 0
    const items = Array.from({ length: 40 }, (_, i) => (i % 2 ? "a" : `h${i}`))
    const results = await pool(items, 10, 2, (h) => h, async (h) => {
      live.set(h, (live.get(h) ?? 0) + 1)
      if (h === "a") worst = Math.max(worst, live.get(h)!)
      await Bun.sleep(2)
      live.set(h, live.get(h)! - 1)
      return h
    })
    expect(worst).toBeLessThanOrEqual(2)
    expect(results).toEqual(items)
  })

  test("a signed reading recovers its signer, and a changed reading does not", async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const fields = { chainId: 1n, url: "https://a", up: true, chainIdOk: true, genesis: "ok", latencyMs: 12, lagBlocks: 0, checkedAt: 100n, blockNumber: 5n, blockHash: "0xaa", genesisSeen: "0xbb" }
    const sig = await account.signMessage({ message: readingText(fields) })
    expect(await signerOf(fields, sig)).toBe(account.address)
    expect(await signerOf({ ...fields, up: false }, sig)).not.toBe(account.address)
  })
})

describe("survey", () => {
  const reading = (change: Partial<Reading>): Reading => ({
    chainId: 1n, url: "https://a.example", up: true, chainIdOk: true, reportedChainId: "1", genesisSeen: "0xaa", blockNumber: 5n, blockHash: "0xbb",
    blockTime: 1000, latencyMs: 10, outcome: "ok", error: "", checkedAt: 1010, ...change,
  })

  test("a pruned RPC with no genesis answer is not a wrong genesis", () => {
    expect(verdictOf(reading({ genesisSeen: "" }), "0xaa")).toBe("passed")
    expect(verdictOf(reading({ genesisSeen: "0xcc" }), "0xaa")).toBe("wrong-genesis")
  })

  test("a right ID on a dead head is stale, and a wrong ID wins over down", () => {
    expect(verdictOf(reading({ blockTime: 1, checkedAt: 100000 }), null)).toBe("stale")
    expect(verdictOf(reading({ up: false, chainIdOk: false, reportedChainId: "2", outcome: "timeout" }), null)).toBe("wrong-chain")
  })

  test("genesis needs two hosts and a clear winner", () => {
    const at = (url: string, genesisSeen: string) => reading({ url, genesisSeen })
    expect(agreeGenesis([at("https://a.x", "0x1")]).hash).toBeNull()
    expect(agreeGenesis([at("https://a.x/1", "0x1"), at("https://a.x/2", "0x1")]).hash).toBeNull()
    expect(agreeGenesis([at("https://a.x", "0x1"), at("https://b.x", "0x1"), at("https://c.x", "0x2")]).hash).toBe("0x1")
    expect(agreeGenesis([at("https://a.x", "0x1"), at("https://b.x", "0x1"), at("https://c.x", "0x2"), at("https://d.x", "0x2")]).hash).toBeNull()
  })
})
