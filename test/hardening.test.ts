import { describe, expect, test } from "bun:test"
import { planChainlist } from "../src/chainlist-import"
import { deriveChain, deriveExplorers, deriveRpcs, parseFile } from "../src/derive"
import { apply, plan, splitDuplicates, withReplan, type Existing } from "../src/importer"
import { checkedBlock } from "../src/probe"
import { counted, lagOf, uniqueTargets } from "../src/prober"
import { genesisOf } from "../src/release"
import type { Source } from "../src/source"
import { MAX_LAG_BLOCKS, verdictOf } from "../src/survey"

const raw = new TextEncoder().encode(JSON.stringify({ name: "One", chain: "T", chainId: 1, shortName: "one", rpc: ["https://a.example"], explorers: [{ name: "x", url: "https://x.example" }] }))
const file = parseFile(raw)
const source: Source = { commit: "c".repeat(40), warnings: [], chains: [{ path: "", raw, attrs: deriveChain(raw), rpcs: deriveRpcs(file), explorers: deriveExplorers(file), conflict: false }] }
const far = 10n ** 12n
const existing = (rpcKeys: string[]): Existing => ({
  chains: [{ key: "c1", chainId: 1n, blob: deriveChain(raw).sourceBlob, expiresAt: far }],
  rpcs: rpcKeys.map((key) => ({ key, id: "1|https://a.example", expiresAt: far })),
  explorers: [{ key: "e1", id: "1|https://x.example", expiresAt: far }],
})

describe("duplicates", () => {
  test("a repeated row is split out and the first is kept", () => {
    const { first, extras } = splitDuplicates([{ k: "a", i: 1 }, { k: "b", i: 1 }, { k: "c", i: 2 }], (r) => String(r.i))
    expect([...first.values()].map((r) => r.k)).toEqual(["a", "c"])
    expect(extras.map((r) => r.k)).toEqual(["b"])
  })

  test("the import plan deletes a duplicate RPC and keeps the original", () => {
    const work = plan(source, existing(["r1", "r2"]), 0n)
    expect(work.deletes).toEqual([{ entityKey: "r2" }])
    expect(work.creates).toHaveLength(0)
    expect(work.counts.rpc).toMatchObject({ same: 1, delete: 1 })
  })

  test("the import plan deletes a duplicate chain", () => {
    const base = existing(["r1"])
    const work = plan(source, { ...base, chains: [...base.chains, { ...base.chains[0]!, key: "c2" }] }, 0n)
    expect(work.deletes).toEqual([{ entityKey: "c2" }])
  })

  test("a clean network plans no deletes", () => {
    expect(plan(source, existing(["r1"]), 0n).deletes).toHaveLength(0)
  })

  const list = { rpcs: [{ chainId: 1n, url: "https://b.example", tracking: "none" as const, policyKey: "" }], policies: new Map<string, string>(), warnings: [] }
  const row = { id: "1|https://b.example", expiresAt: far }
  const privacy = { ...row, tracking: "none", policyKey: "" }

  test("the Chainlist plan deletes duplicate RPC and privacy rows", () => {
    const work = planChainlist(list, "c", { rpcs: [{ ...row, key: "r1" }, { ...row, key: "r2" }], privacy: [{ ...privacy, key: "p1" }, { ...privacy, key: "p2" }], policies: [], listed: new Set() }, 0n)
    expect(work.deletes.map((d) => d.entityKey).sort()).toEqual(["p2", "r2"])
  })

  test("a Chainlist row is removed once upstream lists the same URL", () => {
    const work = planChainlist(list, "c", { rpcs: [{ ...row, key: "r1" }], privacy: [{ ...privacy, key: "p1" }], policies: [], listed: new Set([row.id]) }, 0n)
    expect(work.deletes).toEqual([{ entityKey: "r1" }])
  })

  test("a probing target is only probed once", () => {
    expect(uniqueTargets([{ chainId: 1n, url: "a" }, { chainId: 1n, url: "a" }, { chainId: 2n, url: "a" }])).toHaveLength(2)
  })
})

describe("failed writes", () => {
  /** The worst case: the write lands, and the wallet still reports a failure. */
  function flakyArkiv() {
    const rows: string[] = []
    let failures = 1
    return {
      rows,
      wallet: {
        executeBatch: async (batch: { creates?: { name: string }[] }) => {
          rows.push(...(batch.creates ?? []).map((c) => c.name))
          if (failures-- > 0) throw new Error("receipt timed out")
        },
      },
    }
  }
  const wanted = ["a", "b", "c"]
  const planFor = (rows: string[]) => ({ creates: wanted.filter((n) => !rows.includes(n)).map((name) => ({ name })), patches: [], extensions: [], deletes: [], counts: {} })

  test("a write that landed but reported failure is not written twice", async () => {
    const { rows, wallet } = flakyArkiv()
    await withReplan(() => apply(wallet, planFor(rows), 2), { settleMs: 1 })
    expect(rows.sort()).toEqual(wanted)
  })

  test("resending the same batch is what duplicated records", async () => {
    const { rows, wallet } = flakyArkiv()
    const fixed = planFor(rows)
    await withReplan(() => apply(wallet, fixed, 2), { settleMs: 1 })
    expect(rows.length).toBeGreaterThan(wanted.length)
  })

  test("it gives up and reports the error after its attempts", async () => {
    let tries = 0
    await expect(withReplan(async () => { tries++; throw new Error("no") }, { attempts: 3, settleMs: 1 })).rejects.toThrow("no")
    expect(tries).toBe(3)
  })
})

describe("hostile answers", () => {
  const block = { hash: `0x${"a".repeat(64)}`, number: "0x10", timestamp: "0x20" }

  test("a normal block passes", () => {
    expect(checkedBlock(block)).toEqual({ hash: block.hash, number: 16n, time: 32 })
  })

  test.each([
    ["an over-long hash", { ...block, hash: `0x${"a".repeat(2000)}` }],
    ["a hash that is not hex", { ...block, hash: "nonsense" }],
    ["a missing hash", { ...block, hash: undefined }],
    ["a block number over 64 bits", { ...block, number: `0x${"f".repeat(17)}` }],
    ["a block number that is not a number", { ...block, number: "soon" }],
    ["a time over 64 bits", { ...block, timestamp: `0x${"f".repeat(17)}` }],
  ])("%s is a bad response", (_, value) => {
    expect(() => checkedBlock(value)).toThrow()
  })

  test("a huge head cannot overflow the lag", () => {
    expect(lagOf(2n ** 63n, 5n)).toBe(2_147_483_647)
    expect(lagOf(100n, 90n)).toBe(10)
  })

  test("wrong-chain and wrong-genesis answers do not count as uptime", () => {
    expect(counted({ up: true, chainIdOk: false, genesis: "unknown" })).toBe(false)
    expect(counted({ up: true, chainIdOk: true, genesis: "bad" })).toBe(false)
    expect(counted({ up: true, chainIdOk: true, genesis: "unknown" })).toBe(true)
  })
})

describe("verdicts", () => {
  const reading = (change = {}) => ({ chainId: 1n, url: "u", up: true, chainIdOk: true, reportedChainId: "1", genesisSeen: "0xg", blockNumber: 5n, blockHash: "0xb", blockTime: 1000, latencyMs: 10, outcome: "ok" as const, error: "", checkedAt: 1010, ...change })

  test("an RPC passes only with an agreed first block", () => {
    expect(verdictOf(reading(), "0xg")).toBe("passed")
    expect(verdictOf(reading(), null)).toBe("unconfirmed")
    expect(verdictOf(reading({ genesisSeen: "" }), "0xg")).toBe("unconfirmed")
  })

  test("an RPC far behind the head is stale, however recent its block looks", () => {
    expect(verdictOf(reading(), "0xg", MAX_LAG_BLOCKS)).toBe("stale")
    expect(verdictOf(reading(), "0xg", MAX_LAG_BLOCKS - 1)).toBe("passed")
  })

  test("the signed genesis list leaves out chains with no agreement", () => {
    expect(genesisOf({ "1": { hash: "0xa" }, "2": { hash: null } })).toEqual({ "1": "0xa" })
  })
})
