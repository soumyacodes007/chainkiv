// The checks, in plain words. Used by the trust popup and the Verify page, so both always say the same thing.
import type { Step, Verdict } from "../lib/registry"
import { I } from "./icons"
import { cx } from "./kit"

export const PLAIN: Record<string, [string, string]> = {
  publisher: ["Who published this?", "An ENS name on Ethereum says which address speaks for the list"],
  anchor: ["Did they sign this release?", "The release's fingerprint is in a transaction from that address"],
  manifest: ["Is the release complete?", "Rebuild the whole tree from Arkiv and compare it with what was signed"],
  file: ["Is this the upstream file?", "Hash the record the way git does and compare"],
  attributes: ["Do the searchable fields match?", "Rebuild every field from the file, so none were altered"],
  proof: ["Is it really in the release?", "A Merkle proof links this chain to the signed root"],
  upstream: ["Is the commit really upstream?", "The commit must be in the main branch of ethereum-lists/chains"],
}

export const PROVES = ["The record is byte-for-byte the file at an upstream commit", "The named publisher signed that release", "A changed or copied record fails"]
export const NOT_PROVEN = ["That the EthereumLists maintainers approved anything", "That what's on GitHub is correct", "That a passing RPC is honest on calls we didn't test", "That the publisher's key is safe"]

export const STEP_ICON: Record<string, string> = { pass: "check", fail: "x", pending: "hourglass", "not-run": "ellipsis" }

/** Every step, waiting, for before the first answer arrives. */
export const waitingSteps = () => Object.keys(PLAIN).map((k) => ({ id: k, group: k === "publisher" || k === "anchor" ? "publisher" : "data", label: k, status: "not-run", detail: "" }) as Step)

export function StepRow({ step, shown, last }: { step: Step; shown: boolean; last: boolean }) {
  const [title, text] = PLAIN[step.id] ?? [step.label, ""]
  const status = shown ? step.status : "wait"
  return (
    <li className={cx("vstep", status, last && "last")}>
      <span className="vnode">{shown ? <I n={STEP_ICON[step.status] ?? "ellipsis"} s={14} /> : <I n="loader" s={14} className="spin" />}</span>
      <div className="vbody">
        <div className="t">{title}</div>
        <div className="d">{text}</div>
        {shown && step.detail && <div className="r">{step.detail}</div>}
      </div>
    </li>
  )
}

export function Result({ v }: { v: Verdict }) {
  const map: Record<string, [string, string, string, string]> = {
    verified: ["green", "badge-check", `Verified, release ${v.release}`, `Commit ${v.commit?.slice(0, 10)}. All seven checks passed in this browser.`],
    pending: ["amber", "hourglass", "Pending anchor", "This record is newer than the latest signed release, so it can't be verified yet."],
    failed: ["red", "shield-alert", "Failed", `Stopped at: ${v.steps.find((s) => s.status === "fail")?.label ?? "a check"}.`],
    incomplete: ["gray", "circle-dashed", "Not verified yet", "Some checks could not run, and a check that didn't run never counts as a pass."],
  }
  const [c, icon, title, text] = map[v.state]!
  return (
    <div className={cx("vresult", c)}>
      <I n={icon} s={22} />
      <div>
        <div className="t">{title}</div>
        <div className="d">{text}</div>
      </div>
    </div>
  )
}
