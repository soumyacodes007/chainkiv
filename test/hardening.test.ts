import { describe, expect, test } from "bun:test"
import { planChainlist } from "../src/chainlist-import"
import { deriveChain, deriveExplorers, deriveRpcs, parseFile } from "../src/derive"
import { apply, plan, splitDuplicates, withReplan, type Existing } from "../src/importer"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { checkedBlock, LIMIT_MESSAGE } from "../src/probe"
import { counted, lagOf, probeGently, uniqueTargets } from "../src/prober"
import { isStaleHead, readingText, signerOf } from "../src/readings"
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

describe("probers", () => {
  const reading = (outcome: string) => ({ outcome }) as never
  const target = (url: string) => ({ chainId: 1n, url })

  test("a rate-limited RPC gets a second, gentler try", async () => {
    const calls = new Map<string, number>()
    const answers = await probeGently([target("https://busy.example/a"), target("https://calm.example/b")], async (t) => {
      calls.set(t.url, (calls.get(t.url) ?? 0) + 1)
      return reading(t.url.includes("busy") && calls.get(t.url) === 1 ? "rate-limited" : "ok")
    }, 1)
    expect(calls.get("https://busy.example/a")).toBe(2)
    expect(calls.get("https://calm.example/b")).toBe(1)
    expect(answers.map((a: any) => a.outcome)).toEqual(["ok", "ok"])
  })

  test("the second try goes one at a time per host", async () => {
    let live = 0
    let worst = 0
    const seen = new Set<string>()
    await probeGently(["a", "b", "c", "d"].map((p) => target(`https://busy.example/${p}`)), async (t) => {
      if (!seen.has(t.url)) {
        seen.add(t.url)
        return reading("rate-limited")
      }
      worst = Math.max(worst, ++live)
      await Bun.sleep(2)
      live--
      return reading("ok")
    }, 1)
    expect(worst).toBe(1)
  })

  test("a host that keeps refusing costs one retry, not one per chain", async () => {
    let calls = 0
    await probeGently(["a", "b", "c", "d", "e"].map((p) => target(`https://gateway.example/${p}`)), async () => {
      calls++
      return reading("rate-limited")
    }, 1)
    expect(calls).toBe(6)
  })

  const fields = { chainId: 1n, url: "https://a", up: true, chainIdOk: true, genesis: "ok", latencyMs: 12, lagBlocks: 0, checkedAt: 10_000n, blockNumber: 5n, blockHash: "0xb", genesisSeen: "0xg" }

  test("a new reading signs its block time, and changing it breaks the signature", async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const signed = { ...fields, blockTime: 9_000n }
    const sig = await account.signMessage({ message: readingText(signed) })
    expect(await signerOf(signed, sig)).toBe(account.address)
    expect(await signerOf({ ...signed, blockTime: 9_999n }, sig)).not.toBe(account.address)
  })

  test("a reading from an older prober still verifies", async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const sig = await account.signMessage({ message: readingText(fields) })
    expect(await signerOf(fields, sig)).toBe(account.address)
    expect(readingText(fields).startsWith("chainkiv/health/1|")).toBe(true)
  })

  test("removing the block time from a new reading breaks its signature", async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const sig = await account.signMessage({ message: readingText({ ...fields, blockTime: 1n }) })
    expect(await signerOf(fields, sig)).not.toBe(account.address)
  })

  test("a head over an hour old is stale, and an unknown time isn't held against an RPC", () => {
    expect(isStaleHead({ checkedAt: 10_000, blockTime: 10_000 - 3_601 })).toBe(true)
    expect(isStaleHead({ checkedAt: 10_000, blockTime: 10_000 - 3_600 })).toBe(false)
    expect(isStaleHead({ checkedAt: 10_000, blockTime: 0 })).toBe(false)
    expect(isStaleHead({ checkedAt: 10_000 })).toBe(false)
    expect(isStaleHead({ checkedAt: 10_000, lagBlocks: 1_000 })).toBe(true)
  })

  test("limits sent as RPC errors are recognised, and a real error is not", () => {
    for (const text of ["you reached public endpoint limit", "rate limit exceeded", "Too Many Requests", "daily quota used"]) expect(LIMIT_MESSAGE.test(text)).toBe(true)
    for (const text of ["the method eth_getBlockByNumber does not exist/is not available", "execution reverted", "gas limit too low"]) expect(LIMIT_MESSAGE.test(text)).toBe(false)
  })
})
