// The seven checks. A step that cannot run is reported as such and never counts as a pass. Browser-safe.
import { deriveChain, gitBlobId, type ChainAttrs } from "./derive"
import { decodeManifest, merkleRoot, proveLeaf, type Anchor, type Leaf } from "./release"

export type Status = "pass" | "fail" | "pending" | "not-run"
export type Step = { id: string; group: "publisher" | "data"; label: string; status: Status; detail: string }
export type Verdict = { ok: boolean; state: "verified" | "pending" | "failed" | "incomplete"; release?: string; commit?: string; steps: Step[] }

export const UPSTREAM_REPO = "ethereum-lists/chains"
const UPSTREAM_BRANCH = "master"

/** The part of verification shared by every chain: who published, and the exact contents of the release. */
export type ReleaseCheck = {
  steps: Step[]
  anchor?: Anchor
  publisher?: string
  leaves?: Map<string, Leaf>
  allLeaves?: Leaf[]
}

export type ReleaseInputs = {
  publisher: () => Promise<{ publisher: string; source: string; anchorTx: string }>
  anchor: (tx: string) => Promise<{ anchor: Anchor | null; from: string }>
  manifest: (root: string) => Promise<Uint8Array[]>
  upstream: (commit: string) => Promise<UpstreamResult>
}

export type UpstreamResult = { onMain: boolean; detail: string }

const step = (id: string, group: Step["group"], label: string, status: Status, detail: string): Step => ({ id, group, label, status, detail })
const message = (error: unknown) => (error as Error).message?.split("\n")[0]?.slice(0, 160) ?? "failed"
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export async function checkRelease(inputs: ReleaseInputs): Promise<ReleaseCheck> {
  const out: ReleaseCheck = { steps: [] }

  let trust: Awaited<ReturnType<ReleaseInputs["publisher"]>>
  try {
    trust = await inputs.publisher()
    out.publisher = trust.publisher
    out.steps.push(step("publisher", "publisher", "Publisher named on Ethereum", "pass", `${trust.source} names ${trust.publisher}`))
  } catch (error) {
    out.steps.push(step("publisher", "publisher", "Publisher named on Ethereum", "not-run", message(error)))
    return out
  }

  try {
    const { anchor, from } = await inputs.anchor(trust.anchorTx)
    if (!anchor) out.steps.push(step("anchor", "publisher", "Release signed by the publisher", "fail", "That transaction is not a ChainKiv anchor"))
    else if (!same(from, trust.publisher)) out.steps.push(step("anchor", "publisher", "Release signed by the publisher", "fail", `Signed by ${from}, not the publisher`))
    else {
      out.anchor = anchor
      out.steps.push(step("anchor", "publisher", "Release signed by the publisher", "pass", `Release ${anchor.releaseNo}, transaction ${trust.anchorTx}`))
    }
  } catch (error) {
    out.steps.push(step("anchor", "publisher", "Release signed by the publisher", "not-run", message(error)))
  }
  if (!out.anchor) return out

  try {
    const leaves = decodeManifest(await inputs.manifest(out.anchor.root))
    const root = merkleRoot(leaves)
    if (root !== out.anchor.root) out.steps.push(step("manifest", "data", "Release contents match the signature", "fail", "The manifest on Arkiv does not rebuild the signed root"))
    else if (leaves.length !== out.anchor.chainCount) out.steps.push(step("manifest", "data", "Release contents match the signature", "fail", `Holds ${leaves.length} chains, signed for ${out.anchor.chainCount}`))
    else {
      out.allLeaves = leaves
      out.leaves = new Map(leaves.map((l) => [l.chainId.toString(), l]))
      out.steps.push(step("manifest", "data", "Release contents match the signature", "pass", `${leaves.length} chains rebuild root ${root.slice(0, 12)}…`))
    }
  } catch (error) {
    out.steps.push(step("manifest", "data", "Release contents match the signature", "not-run", message(error)))
  }

  try {
    const result = await inputs.upstream(out.anchor.commit)
    out.steps.push(step("upstream", "data", "Commit is in the upstream main branch", result.onMain ? "pass" : "fail", result.detail))
  } catch (error) {
    out.steps.push(step("upstream", "data", "Commit is in the upstream main branch", "not-run", message(error)))
  }
  return out
}

export type ChainRecord = { raw: Uint8Array; attrs: Record<string, unknown> }

const COMPARED: (keyof ChainAttrs)[] = [
  "chainId", "shortName", "name", "chainFamily", "nativeSymbol", "nativeDecimals", "networkId", "status", "layer", "parentChainId",
  "reusedChainId", "eip155", "eip1559", "eip4844", "eip7702", "sourceBlob",
]

const norm = (value: unknown) => (typeof value === "bigint" || typeof value === "number" ? String(value) : value)

export function checkChain(release: ReleaseCheck, chainId: bigint, record: ChainRecord): Verdict {
  const steps = [...release.steps]
  let blob: string | undefined
  let derived: ChainAttrs | undefined
  try {
    blob = gitBlobId(record.raw)
    derived = deriveChain(record.raw)
  } catch (error) {
    steps.push(step("file", "data", "Record is the upstream file", "fail", `raw cannot be read: ${message(error)}`))
  }

  const leaf = release.leaves?.get(chainId.toString())
  let pending = false
  if (blob && release.leaves) {
    if (!leaf) {
      steps.push(step("file", "data", "Record is the upstream file", "fail", `Chain ${chainId} is not in this release`))
    } else if (leaf.sourceBlob !== blob) {
      pending = record.attrs.sourceBlob === blob
      steps.push(step("file", "data", "Record is the upstream file", pending ? "pending" : "fail", pending ? "This record is newer than the latest signed release" : `File hash ${blob.slice(0, 10)} is not the signed ${leaf.sourceBlob.slice(0, 10)}`))
    } else steps.push(step("file", "data", "Record is the upstream file", "pass", `Git blob ${blob}`))
  } else if (blob) steps.push(step("file", "data", "Record is the upstream file", "not-run", "The release could not be read"))

  if (derived) {
    const wrong = COMPARED.filter((name) => norm(derived![name]) !== norm(record.attrs[name]))
    steps.push(step("attributes", "data", "Attributes match the file", wrong.length ? "fail" : "pass", wrong.length ? `Changed: ${wrong.join(", ")}` : `${COMPARED.length} attributes rebuilt from the file`))
  }

  if (leaf && blob === leaf.sourceBlob && release.allLeaves && release.anchor) {
    const proved = proveLeaf(release.allLeaves, leaf, release.anchor.root)
    steps.push(step("proof", "data", "Merkle proof reaches the signed root", proved ? "pass" : "fail", proved ? "Proof computed locally" : "Proof does not reach the root"))
  } else steps.push(step("proof", "data", "Merkle proof reaches the signed root", pending ? "pending" : "not-run", "No matching leaf to prove"))

  const failed = steps.some((s) => s.status === "fail")
  const notRun = steps.some((s) => s.status === "not-run" && !(pending && s.id === "proof"))
  const state = failed ? "failed" : notRun ? "incomplete" : pending ? "pending" : "verified"
  return { ok: state === "verified", state, release: release.anchor?.releaseNo, commit: release.anchor?.commit, steps }
}

/** Is the commit in main's history? `compare` covers forks too: a fork commit shows as diverged, not behind. */
export async function upstreamFromGitHub(commit: string, fetcher: typeof fetch = fetch): Promise<UpstreamResult> {
  const response = await fetcher(`https://api.github.com/repos/${UPSTREAM_REPO}/compare/${commit}...${UPSTREAM_BRANCH}`, { headers: { accept: "application/vnd.github+json" } })
  if (response.status === 404) return { onMain: false, detail: `GitHub does not know commit ${commit.slice(0, 10)}` }
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const body = (await response.json()) as { status: string; ahead_by: number; behind_by: number }
  const onMain = body.status === "ahead" || body.status === "identical"
  return { onMain, detail: onMain ? `${commit.slice(0, 10)} is ${body.ahead_by} commits behind ${UPSTREAM_BRANCH}` : `${commit.slice(0, 10)} is not in ${UPSTREAM_BRANCH} history (${body.status})` }
}
