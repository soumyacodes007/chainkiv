// The checks as a picture: one record's trust path, crossing Ethereum, Arkiv and GitHub. Every box is live data, and a box
// is only green when the checks behind it passed. Health sits outside the signed release, so it is drawn dashed.
import { useEffect, useState } from "react"
import { fmt, short } from "../lib/format"
import { ETH_EXPLORER, ETH_NETWORK, publisherName, reg, type Step } from "../lib/registry"
import type { RpcRow } from "../lib/types"
import type { Check } from "../lib/useVerdict"
import { STEP_ICON } from "./checks"
import { I } from "./icons"
import { cx } from "./kit"

const COLUMN = [16.5, 50, 83.5]
const HALF = 14.5
const ROW = 84
const BOX = 68
const TOP = 26
const middle = (row: number) => TOP + row * ROW + BOX / 2
const SELECT = { key: true, owner: false, creator: false, createdAt: false, updatedAt: false, expiresAt: false, creationFlags: false, attributeSchema: false, attributes: {} }

const worst = (steps: Step[], ids: string[]) => {
  const mine = steps.filter((s) => ids.includes(s.id))
  if (!mine.length) return "wait"
  for (const status of ["fail", "not-run", "pending"]) if (mine.some((s) => s.status === status)) return status
  return "pass"
}

type Box = { row: number; col: number; title: string; value: string; sub?: string; href?: string; status: string }

function Node({ box }: { box: Box }) {
  const icon = box.status === "wait" ? <I n="loader" s={10} className="spin" /> : <I n={box.status === "signed" ? "activity" : (STEP_ICON[box.status] ?? "circle-dashed")} s={10} />
  const body = (
    <>
      <span className="mt">
        <i>{icon}</i>
        {box.title}
      </span>
      <b>
        {box.value}
        {box.href && <I n="arrow-up-right" s={11} />}
      </b>
      {box.sub && <span className="ms">{box.sub}</span>}
    </>
  )
  const style = { left: `${COLUMN[box.col]! - HALF}%`, width: `${HALF * 2}%`, top: TOP + box.row * ROW, height: BOX }
  return box.href ? (
    <a className={cx("mnode", box.status)} style={style} href={box.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={cx("mnode", box.status)} style={style}>
      {body}
    </div>
  )
}

export function TrustMap({ chainId, check, rpcs }: { chainId: string; check: Check; rpcs: RpcRow[] }) {
  const { verdict, anchorTx, publisher } = check
  const [entity, setEntity] = useState("")
  const [probers, setProbers] = useState<number | null>(null)

  useEffect(() => {
    let on = true
    reg.probers().then((p) => on && setProbers(p.length), () => on && setProbers(0))
    if (publisher)
      reg.client
        .request({ method: "arkiv_query", params: [`arkiv.schema = str('chainkiv.chain') AND chainId = u64(${chainId}) AND $owner = addr(${publisher})`, { select: SELECT, limit: "0x1" }] })
        .then((r: { data: { key: string }[] }) => on && setEntity(r.data[0]?.key ?? ""), () => {})
    return () => {
      on = false
    }
  }, [chainId, publisher])

  const steps = verdict?.steps ?? []
  const of = (...ids: string[]) => worst(steps, ids)
  const chains = steps.find((s) => s.id === "manifest")?.detail?.match(/^(\d+) chains/)?.[1]
  const blob = steps.find((s) => s.id === "file")?.detail?.match(/[0-9a-f]{40}/)?.[0]
  const readings = rpcs.flatMap((r) => r.readings.filter((x) => x.prober !== "survey")).length
  const measured = readings ? "signed" : "none"

  const boxes: Box[] = [
    { row: 0, col: 0, title: "ENS name", value: publisherName || "Not set", sub: `Names ${short(publisher) || "…"}`, href: publisherName ? `https://${ETH_NETWORK === "mainnet" ? "" : "sepolia."}app.ens.domains/${publisherName}` : undefined, status: of("publisher") },
    { row: 1, col: 0, title: "Signed transaction", value: short(anchorTx) || "…", sub: verdict?.release ? `Release ${verdict.release}` : undefined, href: anchorTx ? `${ETH_EXPLORER}/tx/${anchorTx}` : undefined, status: of("anchor") },
    { row: 1, col: 1, title: "Release manifest", value: chains ? `${fmt(Number(chains))} chains` : "…", sub: "Rebuilds the signed root", status: of("manifest") },
    { row: 2, col: 1, title: "Chain record", value: short(entity) || "…", sub: "Entity key on Arkiv", status: of("file", "attributes", "proof") },
    { row: 2, col: 2, title: "Upstream file", value: verdict?.commit?.slice(0, 7) ?? "…", sub: blob ? `Blob ${blob.slice(0, 8)}` : undefined, href: verdict?.commit ? `https://github.com/ethereum-lists/chains/commit/${verdict.commit}` : undefined, status: of("upstream") },
    { row: 3, col: 1, title: "RPC records", value: `${fmt(rpcs.length)} ${rpcs.length === 1 ? "RPC" : "RPCs"}`, sub: "Listed for this chain", status: rpcs.length ? "signed" : "none" },
    { row: 4, col: 1, title: "Signed readings", value: `${fmt(readings)} ${readings === 1 ? "reading" : "readings"}`, sub: "Signature checked here", status: measured },
    { row: 4, col: 0, title: "Prober names", value: probers === null ? "…" : `${probers} on ENS`, sub: "Only these are trusted", status: probers ? "signed" : "none" },
  ]

  const passing = (a: string, b: string) => (a === "fail" || b === "fail" ? "fail" : a === "pass" && b === "pass" ? "pass" : "")
  const down = (col: number, from: number, tone: string, dashed = false) => ({ x1: COLUMN[col]!, x2: COLUMN[col]!, y1: TOP + from * ROW + BOX, y2: TOP + (from + 1) * ROW - 3, tone, dashed })
  const across = (row: number, col: number, tone: string, dashed = false) => ({ x1: COLUMN[col]! + HALF, x2: COLUMN[col + 1]! - HALF - 1, y1: middle(row), y2: middle(row), tone, dashed })
  const lines = [
    down(0, 0, passing(of("publisher"), of("anchor"))),
    across(1, 0, passing(of("anchor"), of("manifest"))),
    down(1, 1, passing(of("manifest"), of("file", "attributes", "proof"))),
    across(2, 1, passing(of("file", "attributes", "proof"), of("upstream"))),
    down(1, 2, "signed", true),
    down(1, 3, "signed", true),
    across(4, 0, "signed", true),
  ]

  return (
    <div className="tmap">
      <div className="tmap-c" style={{ height: TOP + 5 * ROW - (ROW - BOX) }}>
        {["Ethereum", "Arkiv", "GitHub"].map((lane, i) => (
          <span key={lane} className="tlane" style={{ left: `${COLUMN[i]! - HALF}%`, width: `${HALF * 2}%` }}>
            {lane}
          </span>
        ))}
        <svg aria-hidden="true">
          <defs>
            {["", "pass", "fail", "signed"].map((tone) => (
              <marker key={tone} id={`arrow${tone}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M1 1 7 4 1 7z" className={cx("tarrow", tone)} />
              </marker>
            ))}
          </defs>
          {lines.map((l, i) => (
            <line key={i} x1={`${l.x1}%`} x2={`${l.x2}%`} y1={l.y1} y2={l.y2} className={cx("tlink", l.tone)} strokeDasharray={l.dashed ? "4 4" : undefined} markerEnd={`url(#arrow${l.tone})`} />
          ))}
        </svg>
        {boxes.map((box) => (
          <Node key={box.title} box={box} />
        ))}
      </div>
      <p className="tmap-k">
        <span>
          <i className="solid" />
          Part of the seven checks
        </span>
        <span>
          <i className="dash" />
          Live health, signed by probers, outside the release
        </span>
      </p>
    </div>
  )
}
