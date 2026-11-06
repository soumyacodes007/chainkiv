// Right data, right publisher. Seven checks run in this browser, drawn as one unbroken chain from the file to Ethereum.
import { useEffect, useState } from "react"
import { ETH_EXPLORER, publisherName, reg, runVerify, type Step, type Verdict } from "../lib/registry"
import { href } from "../lib/router"
import { useStore } from "../lib/store"
import { Glyph } from "../ui/chain"
import { I } from "../ui/icons"
import { cx, Empty } from "../ui/kit"

const PLAIN: Record<string, [string, string]> = {
  publisher: ["Who published this?", "An ENS name on Ethereum says which address speaks for the list"],
  anchor: ["Did they sign this release?", "The release's fingerprint is in a transaction from that address"],
  manifest: ["Is the release complete?", "Rebuild the whole tree from Arkiv and compare it with what was signed"],
  file: ["Is this the upstream file?", "Hash the record the way git does and compare"],
  attributes: ["Do the searchable fields match?", "Rebuild every field from the file, so none were altered"],
  proof: ["Is it really in the release?", "A Merkle proof links this chain to the signed root"],
  upstream: ["Is the commit really upstream?", "The commit must be in the main branch of ethereum-lists/chains"],
}

const ICON: Record<string, string> = { pass: "check", fail: "x", pending: "hourglass", "not-run": "ellipsis" }

function StepRow({ step, shown, last }: { step: Step; shown: boolean; last: boolean }) {
  const [title, text] = PLAIN[step.id] ?? [step.label, ""]
  const status = shown ? step.status : "wait"
  return (
    <li className={cx("vstep", status, last && "last")}>
      <span className="vnode">
        {shown ? <I n={ICON[step.status] ?? "ellipsis"} s={14} /> : <I n="loader" s={14} className="spin" />}
      </span>
      <div className="vbody">
        <div className="t">{title}</div>
        <div className="d">{text}</div>
        {shown && step.detail && <div className="r">{step.detail}</div>}
      </div>
    </li>
  )
}

function Result({ v }: { v: Verdict }) {
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

export function Verify({ id }: { id: string }) {
  const chain = useStore((s) => s.byId.get(id))
  const [v, setV] = useState<Verdict | null>(null)
  const [shown, setShown] = useState(0)
  const [anchorTx, setAnchorTx] = useState("")

  useEffect(() => {
    let on = true
    let timer: ReturnType<typeof setInterval>
    reg.trust().then((t) => on && setAnchorTx(t.anchorTx), () => {})
    void runVerify(id).then((result) => {
      if (!on) return
      setV(result)
      // Reveal one by one so the chain of checks can be read as it completes.
      timer = setInterval(() => setShown((n) => (n >= 7 ? (clearInterval(timer), n) : n + 1)), 170)
    })
    return () => {
      on = false
      clearInterval(timer)
    }
  }, [id])

  if (!chain)
    return (
      <div className="page">
        <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <Empty icon="search" title={`No network with ID ${id}`} />
        </div>
      </div>
    )

  const steps = v?.steps ?? Object.keys(PLAIN).map((k) => ({ id: k, group: "data", label: k, status: "not-run", detail: "" }) as Step)
  const lanes: [string, string, Step[]][] = [
    ["Right publisher", "Is this who it claims to be?", steps.filter((s) => s.group === "publisher")],
    ["Right data", "Is this exactly what they signed?", steps.filter((s) => s.group === "data")],
  ]
  const done = !!v && shown >= steps.length
  let offset = 0
  return (
    <div className="page">
      <header className="vh">
        <Glyph chain={chain} size={44} />
        <div className="grow">
          <h1>Can you trust {chain.name}'s record?</h1>
          <p>Nothing here relies on our server. Your browser reads Arkiv and Ethereum and does the maths itself.</p>
        </div>
      </header>

      {done ? <Result v={v!} /> : <div className="vresult gray"><I n="loader" s={22} className="spin" /><div><div className="t">Checking…</div><div className="d">Reading Ethereum and Arkiv from this browser</div></div></div>}

      <div className="vlanes">
        {lanes.map(([title, sub, list]) => {
          const start = offset
          offset += list.length
          return (
            <section key={title} className="panel vlane">
              <div className="panel-h">
                <div>
                  <h2>{title}</h2>
                  <p className="panel-sub">{sub}</p>
                </div>
              </div>
              <ol className="vsteps">
                {list.map((s, i) => (
                  <StepRow key={s.id} step={s} shown={!!v && shown > start + i} last={i === list.length - 1} />
                ))}
              </ol>
            </section>
          )
        })}
      </div>

      <div className="demopub">
        <I n="signature" s={15} />
        <span>
          <b>Signed by demo publisher.</b> In this version the key is the ChainKiv team's, {publisherName ? `named by ${publisherName}` : "not the EthereumLists maintainers'"}. They can take over later by pointing the ENS name at their own key, and no app has to change.
        </span>
        {anchorTx && (
          <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
            View the signature
          </a>
        )}
      </div>

      <div className="grid2eq mt">
        <section className="panel">
          <div className="panel-h">
            <h2>What a pass proves</h2>
          </div>
          <div className="panel-b checks">
            {["The record is byte-for-byte the file at an upstream commit", "The named publisher signed that release", "A changed or copied record fails"].map((t) => (
              <div key={t} className="c ok">
                <I n="check" s={14} />
                {t}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2>What a pass doesn't prove</h2>
          </div>
          <div className="panel-b checks">
            {["That the EthereumLists maintainers approved anything", "That what's on GitHub is correct", "That a passing RPC is honest on calls we didn't test", "That the publisher's key is safe"].map((t) => (
              <div key={t} className="c warn">
                <I n="info" s={14} />
                {t}
              </div>
            ))}
          </div>
        </section>
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        {chain.id} · {chain.short} ·{" "}
        <a className="lnk" href={href(`chain/${id}`)}>
          Back to {chain.name}
        </a>
      </p>
    </div>
  )
}
