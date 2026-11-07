// The checks as a picture: one record's trust path, crossing Ethereum, Arkiv and GitHub. Every box is live data, and a box
// is only green when the checks behind it passed. It lights up in path order, so you can follow what depends on what.
// Health sits outside the signed release, so it has its own dashed strip and never counts towards the path.
import { useEffect, useState } from "react"
import { ago, fmt, short } from "../lib/format"
import { ARKIV_EXPLORER, ETH_EXPLORER, ETH_NETWORK, publisherName, reg, type Step } from "../lib/registry"
import type { ChainRow, RpcRow } from "../lib/types"
import type { Check } from "../lib/useVerdict"
import { STEP_ICON } from "./checks"
import { I } from "./icons"
import { cx } from "./kit"

const SELECT = { key: true, owner: false, creator: false, createdAt: false, updatedAt: false, expiresAt: false, creationFlags: false, attributeSchema: false, attributes: {} }
const STEPS = 5
/** The path's five steps, then the health strip. */
const LAST = STEPS + 1
const PACE_MS = 420

const worst = (steps: Step[], ids: string[]) => {
  const mine = steps.filter((s) => ids.includes(s.id))
  if (!mine.length) return "wait"
  for (const status of ["fail", "not-run", "pending"]) if (mine.some((s) => s.status === status)) return status
  return "pass"
}

/** Counts up through the path once there is an answer. It only paces the showing: every status is the real one. */
function useReveal(answeredAt: number | null) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    setStage(0)
    if (answeredAt === null) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setStage(LAST)
    let n = 0
    const timer = setInterval(() => {
      setStage(++n)
      if (n === LAST) clearInterval(timer)
    }, PACE_MS)
    return () => clearInterval(timer)
  }, [answeredAt])
  return stage
}

type StepBox = { n: number; lane: string; title: string; value: string; sub?: string; href?: string; status: string }

function PathStep({ box }: { box: StepBox }) {
  const body = (
    <>
      <span className="tstep-h">
        <i className="tstep-n">{box.n}</i>
        <span className="tstep-t">{box.title}</span>
        <em className="tstep-l">{box.lane}</em>
        {box.status === "wait" ? <I n="loader" s={13} className="spin" /> : box.status !== "idle" && <I n={STEP_ICON[box.status] ?? "circle-dashed"} s={13} className="tstep-i" />}
      </span>
      <b>
        <span>{box.value}</span>
        {box.href && <I n="arrow-up-right" s={12} />}
      </b>
      {box.sub && <span className="tstep-s">{box.sub}</span>}
    </>
  )
  const cls = cx("tstep", `s${box.n}`, box.status)
  return box.href ? (
    <a className={cls} href={box.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function PathLink({ n, on, tone, label, across }: { n: number; on: boolean; tone: string; label: string; across?: boolean }) {
  return (
    <span className={cx("tgo", `g${n}`, across ? "across" : "down", on && "on", tone)}>
      <i />
      <em>{label}</em>
    </span>
  )
}

function Health({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="thc">
      <span>{title}</span>
      <b>{value}</b>
      <small>{sub}</small>
    </div>
  )
}

export function TrustMap({ chain, check, rpcs }: { chain: ChainRow; check: Check; rpcs: RpcRow[] }) {
  const { verdict, anchorTx, publisher, checkedAt } = check
  const [entity, setEntity] = useState("")
  const [probers, setProbers] = useState<number | null>(null)
  const stage = useReveal(verdict ? checkedAt : null)

  useEffect(() => {
    let on = true
    reg.probers().then((p) => on && setProbers(p.length), () => on && setProbers(0))
    if (publisher)
      reg.client
        .request({ method: "arkiv_query", params: [`arkiv.schema = str('chainkiv.chain') AND chainId = u64(${chain.id}) AND $owner = addr(${publisher})`, { select: SELECT, limit: "0x1" }] })
        .then((r: { data: { key: string }[] }) => on && setEntity(r.data[0]?.key ?? ""), () => {})
    return () => {
      on = false
    }
  }, [chain.id, publisher])

  const steps = verdict?.steps ?? []
  const real = [["publisher"], ["anchor"], ["manifest"], ["file", "attributes", "proof"], ["upstream"]].map((ids) => worst(steps, ids))
  /** What a step shows: its real status once reached, a spinner if it's next, and nothing before that. */
  const at = (n: number) => (stage >= n ? real[n - 1]! : stage + 1 === n ? "wait" : "idle")
  const tone = (n: number) => {
    const [a, b] = [real[n - 1]!, real[n]!]
    return a === "fail" || b === "fail" ? "fail" : a === "pass" && b === "pass" ? "pass" : ""
  }

  const manifest = steps.find((s) => s.id === "manifest")?.detail?.match(/^(\d+) chains/)?.[1]
  const blob = steps.find((s) => s.id === "file")?.detail?.match(/[0-9a-f]{40}/)?.[0]
  const readings = rpcs.flatMap((r) => r.readings.filter((x) => x.prober !== "survey")).length

  const boxes: StepBox[] = [
    { n: 1, lane: "Ethereum", title: "ENS name", value: publisherName || "Not set", sub: `Names ${short(publisher) || "…"}`, href: publisherName ? `https://${ETH_NETWORK === "mainnet" ? "" : "sepolia."}app.ens.domains/${publisherName}` : undefined, status: at(1) },
    { n: 2, lane: "Ethereum", title: "Signed transaction", value: short(anchorTx) || "…", sub: verdict?.release ? `Release ${verdict.release}` : undefined, href: anchorTx ? `${ETH_EXPLORER}/tx/${anchorTx}` : undefined, status: at(2) },
    { n: 3, lane: "Arkiv", title: "Signed chain list", value: manifest ? `${fmt(Number(manifest))} chains` : "…", sub: "Rebuilt here, matches the root", status: at(3) },
    { n: 4, lane: "Arkiv", title: `${chain.name}'s record`, value: short(entity) || "…", sub: "Its record on Arkiv", href: entity ? `${ARKIV_EXPLORER}/entity/${entity}` : undefined, status: at(4) },
    { n: 5, lane: "GitHub", title: "Upstream file", value: verdict?.commit?.slice(0, 7) ?? "…", sub: blob ? `Git blob ${blob.slice(0, 8)}` : undefined, href: verdict?.commit ? `https://github.com/ethereum-lists/chains/commit/${verdict.commit}` : undefined, status: at(5) },
  ]

  const reached = real.slice(0, Math.min(stage, STEPS))
  const passed = reached.filter((s) => s === "pass").length
  const finished = stage >= STEPS
  const broke = real.findIndex((s) => s === "fail") + 1
  const headline = !verdict ? "Checking in this browser" : !finished ? `${passed} of ${STEPS} steps passed` : broke ? `The path breaks at step ${broke}` : `${passed} of ${STEPS} steps passed`

  return (
    <div className="tmap">
      <div className="tpath">
        {["Ethereum", "Arkiv", "GitHub"].map((lane, i) => (
          <span key={lane} className={`tlane l${i + 1}`}>
            {lane}
          </span>
        ))}
        <div className={cx("tsum", finished && (passed === STEPS ? "pass" : broke ? "fail" : "part"))} role="status">
          <div className="tsum-t">
            <b>{headline}</b>
            <span>{checkedAt && verdict ? `Checked ${ago(checkedAt / 1000)}` : "Reading Ethereum and Arkiv"}</span>
          </div>
          <div className="tsum-b" aria-hidden="true">
            {real.map((s, i) => (
              <i key={i} className={i < reached.length ? s : undefined} />
            ))}
          </div>
        </div>
        <PathStep box={boxes[0]!} />
        <PathLink n={1} on={stage >= 1} tone={tone(1)} label="named publisher sent this" />
        <PathStep box={boxes[1]!} />
        <PathLink n={2} on={stage >= 2} tone={tone(2)} label="signed this root" across />
        <PathStep box={boxes[2]!} />
        <PathLink n={3} on={stage >= 3} tone={tone(3)} label="contains this record" />
        <PathStep box={boxes[3]!} />
        <PathLink n={4} on={stage >= 4} tone={tone(4)} label="same bytes as" across />
        <PathStep box={boxes[4]!} />
        <p className="tnote">
          <I n="lock" s={13} />
          Checked in your browser. No server of ours is in this path.
        </p>
      </div>

      <section className={cx("thealth", stage >= LAST && "on")} aria-label="Live health">
        <header>
          <I n="activity" s={14} />
          <b>Live health</b>
          <span>Signed by probers, outside the release, so it isn't part of the path above.</span>
        </header>
        <div className="thealth-r">
          <Health title="Prober names" value={probers === null ? "…" : `${probers} on ENS`} sub="Only these are trusted" />
          <I n="arrow-right" s={14} />
          <Health title="Signed readings" value={`${fmt(readings)} ${readings === 1 ? "reading" : "readings"}`} sub="Signature checked here" />
          <I n="arrow-right" s={14} />
          <Health title="RPC records" value={`${fmt(rpcs.length)} ${rpcs.length === 1 ? "RPC" : "RPCs"}`} sub="Listed for this chain" />
        </div>
      </section>
    </div>
  )
}
