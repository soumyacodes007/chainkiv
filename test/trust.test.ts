import { describe, expect, test } from "bun:test"
import { deriveChain, deriveExplorers, deriveRpcs, parseFile } from "../src/derive"
import { plan, type Existing } from "../src/importer"
import { encodeManifest, merkleRoot, type Anchor, type Leaf } from "../src/release"
import type { Source } from "../src/source"
import { checkChain, checkRelease, upstreamFromGitHub, type ReleaseInputs } from "../src/verify"

const encoder = new TextEncoder()
const PUBLISHER = "0xAb00000000000000000000000000000000000001"

const fileFor = (chainId: number, extra: object = {}) =>
  encoder.encode(JSON.stringify({ name: `Chain ${chainId}`, chain: "TST", chainId, shortName: `c${chainId}`, rpc: [`https://rpc${chainId}.example`], explorers: [{ name: "x", url: `https://x${chainId}.example` }], ...extra }))

const sourceOf = (raws: Uint8Array[]): Source => ({
  commit: "c".repeat(40),
  warnings: [],
  chains: raws.map((raw) => {
    const file = parseFile(raw)
    return { path: "", raw, attrs: deriveChain(raw), rpcs: deriveRpcs(file), explorers: deriveExplorers(file), conflict: false }
  }),
})

const leafOf = (raw: Uint8Array): Leaf => {
  const a = deriveChain(raw)
  return { chainId: a.chainId, shortName: a.shortName, sourceBlob: a.sourceBlob }
}

const attrsOf = (raw: Uint8Array) => ({ ...deriveChain(raw) }) as Record<string, unknown>

function inputs(raws: Uint8Array[], change: Partial<ReleaseInputs> = {}, anchorChange: Partial<Anchor> = {}): ReleaseInputs {
  const leaves = raws.map(leafOf)
  const anchor: Anchor = { releaseNo: "1", commit: "c".repeat(40), root: merkleRoot(leaves), chainCount: leaves.length, metaHash: "0x00", ...anchorChange }
  return {
    publisher: async () => ({ publisher: PUBLISHER, source: "test.eth", anchorTx: "0xaa" }),
    anchor: async () => ({ anchor, from: PUBLISHER }),
    manifest: async () => encodeManifest(leaves),
    upstream: async () => ({ onMain: true, detail: "on main" }),
    ...change,
  }
}

const raws = [fileFor(1), fileFor(10), fileFor(8453)]
const statusOf = (steps: { id: string; status: string }[], id: string) => steps.find((s) => s.id === id)?.status

describe("verify", () => {
  test("an untouched record passes all seven steps", async () => {
    const verdict = checkChain(await checkRelease(inputs(raws)), 10n, { raw: raws[1]!, attrs: attrsOf(raws[1]!) })
    expect(verdict.state).toBe("verified")
    expect(verdict.steps.map((s) => s.id)).toEqual(["publisher", "anchor", "manifest", "upstream", "file", "attributes", "proof"])
    expect(verdict.steps.every((s) => s.status === "pass")).toBe(true)
  })

  test("a chain unchanged since an earlier commit still verifies with no new write", async () => {
    const newer = [raws[0]!, raws[1]!, fileFor(8453, { status: "active" })]
    const verdict = checkChain(await checkRelease(inputs(newer)), 1n, { raw: raws[0]!, attrs: attrsOf(raws[0]!) })
    expect(verdict.state).toBe("verified")
  })

  test("changed file bytes fail", async () => {
    const forged = fileFor(10, { rpc: ["https://evil.example"] })
    const verdict = checkChain(await checkRelease(inputs(raws)), 10n, { raw: forged, attrs: { ...attrsOf(raws[1]!) } })
    expect(verdict.state).toBe("failed")
    expect(statusOf(verdict.steps, "file")).toBe("fail")
  })

  test("a changed attribute fails even when the file is intact", async () => {
    const verdict = checkChain(await checkRelease(inputs(raws)), 10n, { raw: raws[1]!, attrs: { ...attrsOf(raws[1]!), status: "active" } })
    expect(verdict.state).toBe("failed")
    expect(verdict.steps.find((s) => s.id === "attributes")!.detail).toContain("status")
  })

  test("a release signed by another wallet fails", async () => {
    const check = await checkRelease(inputs(raws, { anchor: async () => ({ anchor: { releaseNo: "1", commit: "c", root: "0x1", chainCount: 3, metaHash: "0x" }, from: "0xBAD" }) }))
    expect(statusOf(check.steps, "anchor")).toBe("fail")
    expect(checkChain(check, 1n, { raw: raws[0]!, attrs: attrsOf(raws[0]!) }).ok).toBe(false)
  })

  test("a manifest that does not rebuild the signed root fails", async () => {
    const check = await checkRelease(inputs(raws, { manifest: async () => encodeManifest(raws.slice(1).map(leafOf)) }))
    expect(statusOf(check.steps, "manifest")).toBe("fail")
  })

  test("a chain outside the release fails", async () => {
    const extra = fileFor(424242)
    expect(checkChain(await checkRelease(inputs(raws)), 424242n, { raw: extra, attrs: attrsOf(extra) }).state).toBe("failed")
  })

  test("a record newer than the signed release is pending, not failed", async () => {
    const newer = fileFor(10, { status: "active" })
    const verdict = checkChain(await checkRelease(inputs(raws)), 10n, { raw: newer, attrs: attrsOf(newer) })
    expect(verdict.state).toBe("pending")
    expect(verdict.ok).toBe(false)
  })

  test("a step that cannot run never counts as a pass", async () => {
    const offline = await checkRelease(inputs(raws, { upstream: async () => { throw new Error("offline") } }))
    const verdict = checkChain(offline, 1n, { raw: raws[0]!, attrs: attrsOf(raws[0]!) })
    expect(verdict.state).toBe("incomplete")
    expect(verdict.ok).toBe(false)

    const noEns = await checkRelease(inputs(raws, { publisher: async () => { throw new Error("no ENS") } }))
    expect(checkChain(noEns, 1n, { raw: raws[0]!, attrs: attrsOf(raws[0]!) }).ok).toBe(false)
  })

  test("a commit off the main branch fails", async () => {
    const check = await checkRelease(inputs(raws, { upstream: async () => ({ onMain: false, detail: "not in master" }) }))
    expect(checkChain(check, 1n, { raw: raws[0]!, attrs: attrsOf(raws[0]!) }).state).toBe("failed")
  })

  test("GitHub compare results are read correctly", async () => {
    const answer = (status: string, code = 200) => (async () => new Response(JSON.stringify({ status, ahead_by: 2, behind_by: 0 }), { status: code })) as unknown as typeof fetch
    expect((await upstreamFromGitHub("a".repeat(40), answer("ahead"))).onMain).toBe(true)
    expect((await upstreamFromGitHub("a".repeat(40), answer("identical"))).onMain).toBe(true)
    expect((await upstreamFromGitHub("a".repeat(40), answer("diverged"))).onMain).toBe(false)
    expect((await upstreamFromGitHub("a".repeat(40), answer("behind"))).onMain).toBe(false)
    expect((await upstreamFromGitHub("a".repeat(40), answer("x", 404))).onMain).toBe(false)
    expect(upstreamFromGitHub("a".repeat(40), answer("x", 403))).rejects.toThrow("403")
  })
})

describe("import plan", () => {
  const source = sourceOf(raws)
  const FAR = 10_000_000n
  const existing = (blobFor = (c: Source["chains"][number]) => c.attrs.sourceBlob, expiresAt = FAR): Existing => ({
    chains: source.chains.map((c, i) => ({ key: `0x${i}`, chainId: c.attrs.chainId, blob: blobFor(c), expiresAt })),
    rpcs: source.chains.flatMap((c) => c.rpcs.map((r) => ({ key: `0xr${r.chainId}`, id: `${r.chainId}|${r.url}`, expiresAt }))),
    explorers: source.chains.flatMap((c) => c.explorers.map((e) => ({ key: `0xe${e.chainId}`, id: `${e.chainId}|${e.url}`, expiresAt }))),
  })

  test("an empty network gets every record", () => {
    const work = plan(source, { chains: [], rpcs: [], explorers: [] }, 0n)
    expect(work.creates).toHaveLength(9)
    expect(work.counts.chain!.create).toBe(3)
  })

  test("a repeat run writes nothing", () => {
    const work = plan(source, existing(), 0n)
    expect(work.creates.length + work.patches.length + work.extensions.length + work.deletes.length).toBe(0)
    expect(work.counts.chain!.same).toBe(3)
  })

  test("a changed file is patched", () => {
    const work = plan(source, existing((c) => (c.attrs.chainId === 10n ? "old" : c.attrs.sourceBlob)), 0n)
    expect(work.patches).toHaveLength(1)
    expect(work.counts.chain!.patch).toBe(1)
  })

  test("records near expiry are extended", () => {
    const work = plan(source, existing(undefined, 100n), 0n)
    expect(work.counts.chain!.extend).toBe(3)
    expect(work.counts.rpc!.extend).toBe(3)
  })

  test("a chain removed upstream is deleted with its RPCs and explorers", () => {
    const old = existing()
    const work = plan(sourceOf(raws.slice(0, 2)), old, 0n)
    expect(work.counts.chain!.delete).toBe(1)
    expect(work.counts.rpc!.delete).toBe(1)
    expect(work.counts.explorer!.delete).toBe(1)
  })
})
