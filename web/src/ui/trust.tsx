// The trust box on a network's page. Three lines, each ticked only by the checks behind it. Selecting it opens the lot.
import { useState, type ReactNode } from "react"
import { ago, short } from "../lib/format"
import { ETH_EXPLORER, publisherName, type Step } from "../lib/registry"
import type { ChainRow, RpcRow } from "../lib/types"
import type { Check } from "../lib/useVerdict"
import { NOT_PROVEN, PROVES, Result, STEP_ICON, StepRow, waitingSteps } from "./checks"
import { I } from "./icons"
import { cx, Modal, Seg } from "./kit"
import { TrustMap } from "./trustMap"

const UPSTREAM = "https://github.com/ethereum-lists/chains/commit"

/** The worst status among these steps, so a line is never ticked while one of its checks hasn't passed. */
function lineStatus(steps: Step[], ids: string[]) {
  const mine = steps.filter((s) => ids.includes(s.id))
  if (!mine.length) return "wait"
  for (const status of ["fail", "not-run", "pending"]) if (mine.some((s) => s.status === status)) return status
  return "pass"
}

function Line({ status, label, children }: { status: string; label: string; children: ReactNode }) {
  return (
    <div className={cx("tline", status)}>
      <span className="tline-n">{status === "wait" ? <I n="loader" s={11} className="spin" /> : <I n={STEP_ICON[status] ?? "ellipsis"} s={11} />}</span>
      <span className="tline-l">{label}</span>
      <span className="tline-v">{children}</span>
    </div>
  )
}

function Details({ chain, check, rpcs, onClose }: { chain: ChainRow; check: Check; rpcs: RpcRow[]; onClose: () => void }) {
  const { verdict, anchorTx, retry } = check
  const [tab, setTab] = useState("map")
  const steps = verdict?.steps ?? waitingSteps()
  const lanes: [string, Step[]][] = [
    ["Right publisher", steps.filter((s) => s.group === "publisher")],
    ["Right data", steps.filter((s) => s.group === "data")],
  ]
  return (
    <Modal
      size="xl"
      title={`Can you trust ${chain.name}'s record?`}
      sub="Your browser reads Arkiv and Ethereum and does the maths itself."
      onClose={onClose}
      footer={
        <>
          {tab === "map" && (
            <div className="tfoot">
              <I n="signature" s={15} />
              <span>
                <b>Signed by demo publisher.</b> {publisherName ? `Named by ${publisherName}.` : ""}
              </span>
              {anchorTx && (
                <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
                  View the signature
                </a>
              )}
            </div>
          )}
          <span className="sp" />
          <button className="btn btn-secondary btn-sm" disabled={!verdict} onClick={retry}>
            <I n="refresh-cw" s={13} />
            Check again
          </button>
        </>
      }
    >
      <div className="tdhead">
        {verdict ? (
          <Result v={verdict} />
        ) : (
          <div className="vresult gray">
            <I n="loader" s={22} className="spin" />
            <div>
              <div className="t">Checking…</div>
              <div className="d">Reading Ethereum and Arkiv from this browser</div>
            </div>
          </div>
        )}
        <div className="tabs-t">
          <Seg label="Show" value={tab} onChange={setTab} options={[["map", "Map"], ["checks", "All checks"]]} />
        </div>
      </div>
      {tab === "map" ? (
        <TrustMap chain={chain} check={check} rpcs={rpcs} />
      ) : (
        <>
          {lanes.map(([title, list]) => (
            <section key={title}>
              <h3 className="tdh">{title}</h3>
              <ol className="vsteps tdsteps">
                {list.map((s, i) => (
                  <StepRow key={s.id} step={s} shown={!!verdict} last={i === list.length - 1} />
                ))}
              </ol>
            </section>
          ))}
          <section>
            <h3 className="tdh">What a pass proves</h3>
            <div className="checks">
              {PROVES.map((t) => (
                <div key={t} className="c ok">
                  <I n="check" s={14} />
                  {t}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="tdh">What a pass doesn't prove</h3>
            <div className="checks">
              {NOT_PROVEN.map((t) => (
                <div key={t} className="c warn">
                  <I n="info" s={14} />
                  {t}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab !== "map" && <div className="demopub">
        <I n="signature" s={15} />
        <span>
          <b>Signed by demo publisher.</b> {publisherName ? `Named by ${publisherName}. ` : ""}The EthereumLists maintainers can take over by pointing the ENS name at their own key, and no app has to change.
        </span>
        {anchorTx && (
          <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
            View the signature
          </a>
        )}
      </div>}
    </Modal>
  )
}

export function TrustBox({ chain, check, rpcs }: { chain: ChainRow; check: Check; rpcs: RpcRow[] }) {
  const [open, setOpen] = useState(false)
  const { verdict, anchorTx, publisher, checkedAt, slow } = check
  const steps = verdict?.steps ?? []
  const passed = steps.filter((s) => s.status === "pass").length
  const heads: Record<string, [string, string, string, string]> = {
    verified: ["green", "badge-check", `Verified · Release ${verdict?.release}`, `${passed} of ${steps.length} checks passed in your browser`],
    pending: ["amber", "hourglass", "Pending anchor", "Newer than the latest signed release"],
    failed: ["red", "shield-alert", "Failed", `${passed} of ${steps.length} checks passed`],
    incomplete: ["gray", "circle-dashed", "Couldn't finish checking", "A check that didn't run never counts as a pass"],
  }
  const [tone, icon, title, sub] = verdict ? heads[verdict.state]! : ["gray", "loader", slow ? "Still checking…" : "Checking…", slow ? "Arkiv or GitHub is slow to answer, so this is taking longer" : "Reading Ethereum and Arkiv from this browser"]
  return (
    <section className={cx("panel tbox", tone)}>
      <button className="tbox-open" onClick={() => setOpen(true)} aria-label={`${title}. Show all checks`} />
      <div className="tbox-h">
        <I n={icon} s={20} className={verdict ? undefined : "spin"} />
        <div>
          <div className="t">{title}</div>
          <div className="d">{sub}</div>
        </div>
      </div>
      <div className="tlines">
        <Line status={lineStatus(steps, ["publisher"])} label="Published by">
          {publisherName || short(publisher) || "…"}
        </Line>
        <Line status={lineStatus(steps, ["anchor"])} label="Signed in">
          {anchorTx ? (
            <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
              {short(anchorTx)}
              <I n="arrow-up-right" s={12} />
            </a>
          ) : (
            "…"
          )}
        </Line>
        <Line status={lineStatus(steps, ["manifest", "file", "attributes", "proof", "upstream"])} label="Upstream">
          {verdict?.commit ? (
            <a className="lnk" href={`${UPSTREAM}/${verdict.commit}`} target="_blank" rel="noreferrer">
              {verdict.commit.slice(0, 7)}
              <I n="arrow-up-right" s={12} />
            </a>
          ) : (
            "…"
          )}
        </Line>
      </div>
      <div className="tbox-f">
        {checkedAt && <span>Checked {ago(checkedAt / 1000)}</span>}
        <span className="tbox-more">
          See all checks
          <I n="chevron-right" s={13} />
        </span>
      </div>
      {open && <Details chain={chain} check={check} rpcs={rpcs} onClose={() => setOpen(false)} />}
    </section>
  )
}
