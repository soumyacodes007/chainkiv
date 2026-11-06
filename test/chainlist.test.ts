import { describe, expect, test } from "bun:test"
import { hashRows, parseChainlist } from "../src/chainlist"
import { planChainlist, type ChainlistExisting } from "../src/chainlist-import"

const sample = `
import x from "./other";
export const privacyStatement = {
  good: "We keep nothing.",
  "0xRPC": \`Plain template\`,
  joined: "one " + "two",
  /* removed: "old", */
};
export const extraRpcs = {
  1: {
    rpcs: [
      { url: "https://a.example", tracking: "none", trackingDetails: privacyStatement.good },
      { url: "https://b.example", tracking: "yes", trackingDetails: privacyStatement["0xRPC"] },
      { url: "https://c.example", tracking: "odd", trackingDetails: "inline text" },
      "https://d.example",
      "https://d.example",
    ],
  },
  8453: { rpcs: [{ url: "https://a.example", tracking: "limited", trackingDetails: privacyStatement.joined }] },
};
export default extraRpcs;
`

describe("chainlist", () => {
  const list = parseChainlist(sample)

  test("plain data is read, repeats are dropped and missing labels stay unspecified", () => {
    expect(list.rpcs).toHaveLength(5)
    expect(list.rpcs[0]).toEqual({ chainId: 1n, url: "https://a.example", tracking: "none", policyKey: "good" })
    expect(list.rpcs[2]!.tracking).toBe("unspecified")
    expect(list.rpcs[3]).toEqual({ chainId: 1n, url: "https://d.example", tracking: "unspecified", policyKey: "" })
    expect(list.policies.get("joined")).toBe("one two")
    expect([...list.policies.keys()].some((k) => k.startsWith("inline-"))).toBe(true)
  })

  test("code in the file is never run and is reported", () => {
    ;(globalThis as any).chainlistRan = false
    const hostile = `
      export const privacyStatement = { evil: (globalThis.chainlistRan = true, "x"), ok: "fine" };
      export const extraRpcs = { 1: { rpcs: [
        { url: (globalThis.chainlistRan = true, "https://e.example"), tracking: "none" },
        { url: "https://f.example", trackingDetails: privacyStatement.evil },
      ] } };`
    const parsed = parseChainlist(hostile)
    expect((globalThis as any).chainlistRan).toBe(false)
    expect(parsed.rpcs.map((r) => r.url)).toEqual(["https://f.example"])
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(3)
  })

  test("a changed format is refused", () => {
    expect(() => parseChainlist("export const other = 1")).toThrow("format")
  })

  const empty: ChainlistExisting = { rpcs: [], privacy: [], policies: [], listed: new Set() }

  test("a URL already in ethereum-lists gets a label but no second RPC record", () => {
    const work = planChainlist(list, "c", { ...empty, listed: new Set(["1|https://a.example"]) }, 0n)
    expect(work.counts.rpc!.create).toBe(4)
    expect(work.counts.privacy!.create).toBe(5)
  })

  test("every label and policy names its source and licence", () => {
    const work = planChainlist(list, "abc", empty, 0n)
    const labelled = work.creates.filter((c) => c.values.licence)
    expect(labelled.length).toBe(work.counts.privacy!.create + work.counts.policy!.create)
  })

  test("a repeat run writes nothing", () => {
    const first = planChainlist(list, "abc", empty, 0n)
    expect(first.counts.privacy!.create).toBe(5)
    const far = 100_000_000n
    const same: ChainlistExisting = {
      rpcs: list.rpcs.map((r, i) => ({ key: `0x${i}`, id: `${r.chainId}|${r.url}`, expiresAt: far })),
      privacy: list.rpcs.map((r, i) => ({ key: `0xp${i}`, id: `${r.chainId}|${r.url}`, tracking: r.tracking, policyKey: r.policyKey, expiresAt: far })),
      policies: [...list.policies].map(([policyKey, value], i) => ({ key: `0xq${i}`, policyKey, hash: first.creates.find((c) => c.values.policyHash && c.values.policyKey.value === policyKey)?.values.policyHash.value ?? value, expiresAt: far })),
      listed: new Set(),
    }
    const again = planChainlist(list, "abc", same, 0n)
    expect(again.creates.length + again.patches.length + again.deletes.length + again.extensions.length).toBe(0)
  })

  test("the hash changes when a label changes", () => {
    const changed = { ...list, rpcs: list.rpcs.map((r, i) => (i ? r : { ...r, tracking: "yes" as const })) }
    expect(hashRows(changed)).not.toBe(hashRows(list))
  })
})
