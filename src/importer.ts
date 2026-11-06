// Turns one upstream commit into Arkiv entities. Each run compares with what the publisher already owns, so a rerun
// finishes an interrupted import and a repeat run writes nothing new.
import { ExpirationTime } from "@arkiv-network/sdk"
import { eq } from "@arkiv-network/sdk/query"
import { bool, bytes, i32, str, u64 } from "@arkiv-network/sdk/schema"
import { readAll, val } from "./arkiv"
import { encodeManifest, encodeMeta, merkleRoot, metaHash, type ReleaseMeta } from "./release"
import { Chain, Explorer, Manifest, Release, ReleaseMeta as MetaSchema, Rpc } from "./schemas"
import { leavesOf, type Source, type SourceChain } from "./source"

const BLOCK_SECONDS = 2
const DAY_BLOCKS = 86_400 / BLOCK_SECONDS
export const CORE_DAYS = 90
export const EXT_DAYS = 30
const CORE_RENEW_BLOCKS = 45 * DAY_BLOCKS
const EXT_RENEW_BLOCKS = 15 * DAY_BLOCKS

export type Plan = {
  creates: any[]
  patches: any[]
  extensions: any[]
  deletes: any[]
  counts: Record<string, { create: number; patch: number; extend: number; delete: number; same: number }>
}

const tally = () => ({ create: 0, patch: 0, extend: 0, delete: 0, same: 0 })

function chainValues(c: SourceChain, commit: string) {
  const a = c.attrs
  return {
    chainId: u64(a.chainId),
    shortName: str(a.shortName),
    name: str(a.name),
    chainFamily: str(a.chainFamily),
    nativeSymbol: str(a.nativeSymbol),
    nativeDecimals: i32(a.nativeDecimals),
    networkId: u64(a.networkId),
    status: str(a.status),
    layer: str(a.layer),
    ...(a.parentChainId === undefined ? {} : { parentChainId: u64(a.parentChainId) }),
    reusedChainId: bool(a.reusedChainId),
    conflict: bool(c.conflict),
    eip155: bool(a.eip155),
    eip1559: bool(a.eip1559),
    eip4844: bool(a.eip4844),
    eip7702: bool(a.eip7702),
    sourceBlob: str(a.sourceBlob),
    sourceCommit: str(commit),
    raw: bytes(c.raw),
  }
}

export type Existing = {
  chains: { key: string; chainId: bigint; blob: string; expiresAt: bigint }[]
  rpcs: { key: string; id: string; expiresAt: bigint }[]
  explorers: { key: string; id: string; expiresAt: bigint }[]
}

const id = (chainId: bigint, url: string) => `${chainId}|${url}`

/** Keeps the first row for each identity and returns the rest, so a repeated record is seen and removed, not hidden. */
export function splitDuplicates<T>(rows: T[], idOf: (row: T) => string) {
  const first = new Map<string, T>()
  const extras: T[] = []
  for (const row of rows) {
    if (first.has(idOf(row))) extras.push(row)
    else first.set(idOf(row), row)
  }
  return { first, extras }
}

export async function readExisting(client: any, owner: string): Promise<Existing> {
  const [chains, rpcs, explorers] = await Promise.all([
    readAll(client, { schema: Chain, owner, select: { chainId: true, sourceBlob: true, $expiresAt: true } }),
    readAll(client, { schema: Rpc, owner, select: { chainId: true, url: true, origin: true, $expiresAt: true } }),
    readAll(client, { schema: Explorer, owner, select: { chainId: true, url: true, $expiresAt: true } }),
  ])
  return {
    chains: chains.map((r: any) => ({ key: r.$key, chainId: val<bigint>(r.chainId)!, blob: val<string>(r.sourceBlob)!, expiresAt: BigInt(r.$expiresAt) })),
    rpcs: rpcs.filter((r: any) => val(r.origin) === "list").map((r: any) => ({ key: r.$key, id: id(val<bigint>(r.chainId)!, val<string>(r.url)!), expiresAt: BigInt(r.$expiresAt) })),
    explorers: explorers.map((r: any) => ({ key: r.$key, id: id(val<bigint>(r.chainId)!, val<string>(r.url)!), expiresAt: BigInt(r.$expiresAt) })),
  }
}

/** Pure: what has to change on Arkiv for it to match this commit. */
export function plan(source: Source, existing: Existing, head: bigint): Plan {
  const out: Plan = { creates: [], patches: [], extensions: [], deletes: [], counts: { chain: tally(), rpc: tally(), explorer: tally() } }
  const expiration = (days: number) => ExpirationTime.fromDays(days)

  const { first: chains, extras: spareChains } = splitDuplicates(existing.chains, (c) => c.chainId.toString())
  for (const c of source.chains) {
    const old = chains.get(c.attrs.chainId.toString())
    chains.delete(c.attrs.chainId.toString())
    if (!old) {
      out.creates.push({ schema: Chain, values: chainValues(c, source.commit), expiration: expiration(CORE_DAYS) })
      out.counts.chain!.create++
    } else if (old.blob !== c.attrs.sourceBlob) {
      out.patches.push({ schema: Chain, entityKey: old.key, set: chainValues(c, source.commit) })
      out.extensions.push({ entityKey: old.key, expiration: expiration(CORE_DAYS) })
      out.counts.chain!.patch++
    } else if (old.expiresAt - head < BigInt(CORE_RENEW_BLOCKS)) {
      out.extensions.push({ entityKey: old.key, expiration: expiration(CORE_DAYS) })
      out.counts.chain!.extend++
    } else out.counts.chain!.same++
  }
  for (const old of [...chains.values(), ...spareChains]) {
    out.deletes.push({ entityKey: old.key })
    out.counts.chain!.delete++
  }

  const sync = (name: "rpc" | "explorer", wanted: Map<string, { schema: unknown; values: object }>, have: Existing["rpcs"]) => {
    const { first: left, extras } = splitDuplicates(have, (e) => e.id)
    for (const [key, item] of wanted) {
      const old = left.get(key)
      left.delete(key)
      if (!old) {
        out.creates.push({ ...item, expiration: expiration(EXT_DAYS) })
        out.counts[name]!.create++
      } else if (old.expiresAt - head < BigInt(EXT_RENEW_BLOCKS)) {
        out.extensions.push({ entityKey: old.key, expiration: expiration(EXT_DAYS) })
        out.counts[name]!.extend++
      } else out.counts[name]!.same++
    }
    for (const old of [...left.values(), ...extras]) {
      out.deletes.push({ entityKey: old.key })
      out.counts[name]!.delete++
    }
  }

  const rpcs = new Map<string, { schema: unknown; values: object }>()
  const explorers = new Map<string, { schema: unknown; values: object }>()
  for (const c of source.chains) {
    for (const r of c.rpcs) {
      rpcs.set(id(r.chainId, r.url), {
        schema: Rpc,
        values: { chainId: u64(r.chainId), url: str(r.url), protocol: str(r.protocol), needsApiKey: bool(r.needsApiKey), origin: str(r.origin) },
      })
    }
    for (const e of c.explorers) {
      explorers.set(id(e.chainId, e.url), {
        schema: Explorer,
        values: { chainId: u64(e.chainId), name: str(e.name), standard: str(e.standard), url: str(e.url) },
      })
    }
  }
  sync("rpc", rpcs, existing.rpcs)
  sync("explorer", explorers, existing.explorers)
  return out
}

const chunk = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

/**
 * Runs a write step and, if it fails, waits and runs it again from a fresh read of Arkiv. A failed write can still have
 * landed, for example when only the receipt timed out, so resending the same batch would write it twice.
 */
export async function withReplan<T>(run: () => Promise<T>, { attempts = 5, settleMs = 20_000, onRetry }: { attempts?: number; settleMs?: number; onRetry?: (error: unknown, attempt: number) => void } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= attempts) throw error
      onRetry?.(error, attempt)
      await Bun.sleep(settleMs * attempt)
    }
  }
}

/** One wallet, one write at a time: parallel writes collide on nonces. */
export async function apply(wallet: any, work: Plan, batchSize: number, onProgress?: (done: number, total: number) => void) {
  const steps = [
    ...chunk(work.deletes, batchSize * 2).map((deletes) => ({ deletes })),
    ...chunk(work.creates, batchSize).map((creates) => ({ creates })),
    ...chunk(work.patches, batchSize).map((patches) => ({ patches })),
    ...chunk(work.extensions, batchSize * 2).map((extensions) => ({ extensions })),
  ]
  let done = 0
  for (const step of steps) {
    await wallet.executeBatch(step)
    onProgress?.(++done, steps.length)
  }
  return steps.length
}

export type ReleaseWrite = { releaseNo: bigint; root: string; chainCount: number; metaHash: string }

/** Writes what a reader needs to rebuild the tree. Skips the write if this root and meta are already there. */
export async function writeRelease(client: any, wallet: any, owner: string, source: Source, meta: ReleaseMeta, anchorNetwork: string): Promise<ReleaseWrite> {
  const leaves = leavesOf(source)
  const root = merkleRoot(leaves)
  const encodedMeta = encodeMeta(meta)
  const hash = metaHash(encodedMeta)
  const releases = await readAll(client, { schema: Release, owner, select: { releaseNo: true, merkleRoot: true, metaHash: true } })
  const same = releases.find((r: any) => val(r.merkleRoot) === root && val(r.metaHash) === hash)
  if (same) return { releaseNo: val<bigint>((same as any).releaseNo)!, root, chainCount: leaves.length, metaHash: hash }

  const releaseNo = releases.reduce((max: bigint, r: any) => (val<bigint>(r.releaseNo)! > max ? val<bigint>(r.releaseNo)! : max), 0n) + 1n
  const parts = encodeManifest(leaves)
  const expiration = ExpirationTime.fromDays(CORE_DAYS)
  // One transaction per part: together they exceed what a transaction can carry. A rerun writes only what is missing,
  // and the release goes last, so its presence means the rest is there.
  const written = await readAll<any>(client, { schema: Manifest, owner, where: eq("merkleRoot", str(root)), select: { part: true } })
  const have = new Set(written.map((r) => val<number>(r.part)))
  for (const [part, data] of parts.entries()) {
    if (have.has(part)) continue
    await wallet.executeBatch({ creates: [{ schema: Manifest, values: { merkleRoot: str(root), part: i32(part), parts: i32(parts.length), data: bytes(data) }, expiration }] })
  }
  const metas = await readAll(client, { schema: MetaSchema, owner, where: eq("metaHash", str(hash)), select: { metaHash: true } })
  await wallet.executeBatch({
    creates: [
      ...(metas.length ? [] : [{ schema: MetaSchema, values: { metaHash: str(hash), data: bytes(encodedMeta) }, expiration }]),
      {
        schema: Release,
        values: {
          releaseNo: u64(releaseNo), commit: str(source.commit), merkleRoot: str(root), chainCount: u64(BigInt(leaves.length)),
          metaHash: str(hash), anchorNetwork: str(anchorNetwork),
        },
        expiration,
      },
    ],
  })
  return { releaseNo, root, chainCount: leaves.length, metaHash: hash }
}
