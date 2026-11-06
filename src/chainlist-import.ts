// Writes Chainlist RPCs and privacy labels. They are kept apart from ethereum-lists records and marked with their
// source and licence on every entity, because they come from a different repo under a different licence.
import { ExpirationTime } from "@arkiv-network/sdk"
import { bool, bytes, str, u64 } from "@arkiv-network/sdk/schema"
import { readAll, val } from "./arkiv"
import { CHAINLIST_LICENCE, CHAINLIST_NAME, policyHash, type Chainlist } from "./chainlist"
import { EXT_DAYS, splitDuplicates, type Plan } from "./importer"
import { PrivacyPolicy, Rpc, RpcPrivacy } from "./schemas"

const RENEW_BLOCKS = 15n * 43_200n

export type ChainlistExisting = {
  rpcs: { key: string; id: string; expiresAt: bigint }[]
  privacy: { key: string; id: string; tracking: string; policyKey: string; expiresAt: bigint }[]
  policies: { key: string; policyKey: string; hash: string; expiresAt: bigint }[]
  /** ethereum-lists RPCs, so a URL that is already listed is not written twice. */
  listed: Set<string>
}

const id = (chainId: bigint, url: string) => `${chainId}|${url}`

export async function readChainlistExisting(client: any, owner: string): Promise<ChainlistExisting> {
  const [rpcs, privacy, policies] = await Promise.all([
    readAll<any>(client, { schema: Rpc, owner, select: { chainId: true, url: true, origin: true, $expiresAt: true } }),
    readAll<any>(client, { schema: RpcPrivacy, owner, select: { chainId: true, url: true, tracking: true, policyKey: true, $expiresAt: true } }),
    readAll<any>(client, { schema: PrivacyPolicy, owner, select: { policyKey: true, policyHash: true, $expiresAt: true } }),
  ])
  const rowId = (r: any) => id(val<bigint>(r.chainId)!, val<string>(r.url)!)
  return {
    rpcs: rpcs.filter((r) => val(r.origin) === "chainlist").map((r) => ({ key: r.$key, id: rowId(r), expiresAt: BigInt(r.$expiresAt) })),
    listed: new Set(rpcs.filter((r) => val(r.origin) !== "chainlist").map(rowId)),
    privacy: privacy.map((r) => ({ key: r.$key, id: rowId(r), tracking: val<string>(r.tracking)!, policyKey: val<string>(r.policyKey)!, expiresAt: BigInt(r.$expiresAt) })),
    policies: policies.map((r) => ({ key: r.$key, policyKey: val<string>(r.policyKey)!, hash: val<string>(r.policyHash)!, expiresAt: BigInt(r.$expiresAt) })),
  }
}

const tally = () => ({ create: 0, patch: 0, extend: 0, delete: 0, same: 0 })

export function planChainlist(list: Chainlist, commit: string, existing: ChainlistExisting, head: bigint): Plan {
  const out: Plan = { creates: [], patches: [], extensions: [], deletes: [], counts: { rpc: tally(), privacy: tally(), policy: tally() } }
  const expiration = ExpirationTime.fromDays(EXT_DAYS)
  const stamp = { source: str(CHAINLIST_NAME), sourceCommit: str(commit), licence: str(CHAINLIST_LICENCE) }
  const soon = (expiresAt: bigint) => expiresAt - head < RENEW_BLOCKS

  const { first: policies, extras: sparePolicies } = splitDuplicates(existing.policies, (p) => p.policyKey)
  for (const [policyKey, value] of list.policies) {
    const old = policies.get(policyKey)
    policies.delete(policyKey)
    const hash = policyHash(value)
    const values = { policyKey: str(policyKey), policyHash: str(hash), ...stamp, text: bytes(new TextEncoder().encode(value)) }
    if (!old) {
      out.creates.push({ schema: PrivacyPolicy, values, expiration })
      out.counts.policy!.create++
    } else if (old.hash !== hash) {
      out.patches.push({ schema: PrivacyPolicy, entityKey: old.key, set: values })
      out.extensions.push({ entityKey: old.key, expiration })
      out.counts.policy!.patch++
    } else if (soon(old.expiresAt)) {
      out.extensions.push({ entityKey: old.key, expiration })
      out.counts.policy!.extend++
    } else out.counts.policy!.same++
  }
  for (const old of [...policies.values(), ...sparePolicies]) {
    out.deletes.push({ entityKey: old.key })
    out.counts.policy!.delete++
  }

  const { first: rpcs, extras: spareRpcs } = splitDuplicates(existing.rpcs, (r) => r.id)
  const { first: privacy, extras: sparePrivacy } = splitDuplicates(existing.privacy, (r) => r.id)
  for (const r of list.rpcs) {
    const key = id(r.chainId, r.url)
    const oldRpc = rpcs.get(key)
    rpcs.delete(key)
    if (existing.listed.has(key)) {
      // Upstream has since listed this URL, so our Chainlist copy of it would be a second record.
      if (oldRpc) spareRpcs.push(oldRpc)
    } else {
      if (!oldRpc) {
        out.creates.push({
          schema: Rpc,
          values: { chainId: u64(r.chainId), url: str(r.url), protocol: str(r.url.split(":")[0]!.toLowerCase()), needsApiKey: bool(r.url.includes("${")), origin: str("chainlist") },
          expiration,
        })
        out.counts.rpc!.create++
      } else if (soon(oldRpc.expiresAt)) {
        out.extensions.push({ entityKey: oldRpc.key, expiration })
        out.counts.rpc!.extend++
      } else out.counts.rpc!.same++
    }

    const old = privacy.get(key)
    privacy.delete(key)
    const values = { chainId: u64(r.chainId), url: str(r.url), tracking: str(r.tracking), policyKey: str(r.policyKey), ...stamp }
    if (!old) {
      out.creates.push({ schema: RpcPrivacy, values, expiration })
      out.counts.privacy!.create++
    } else if (old.tracking !== r.tracking || old.policyKey !== r.policyKey) {
      out.patches.push({ schema: RpcPrivacy, entityKey: old.key, set: values })
      out.extensions.push({ entityKey: old.key, expiration })
      out.counts.privacy!.patch++
    } else if (soon(old.expiresAt)) {
      out.extensions.push({ entityKey: old.key, expiration })
      out.counts.privacy!.extend++
    } else out.counts.privacy!.same++
  }
  for (const old of [...rpcs.values(), ...spareRpcs]) {
    out.deletes.push({ entityKey: old.key })
    out.counts.rpc!.delete++
  }
  for (const old of [...privacy.values(), ...sparePrivacy]) {
    out.deletes.push({ entityKey: old.key })
    out.counts.privacy!.delete++
  }
  return out
}
