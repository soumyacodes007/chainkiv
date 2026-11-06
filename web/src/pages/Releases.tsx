// Each signed snapshot of the list: what it covers and where its signature lives.
import { useEffect, useState } from "react"
import { fmt, UPSTREAM } from "../lib/format"
import { ETH_EXPLORER, hasPublisher, reg } from "../lib/registry"
import { useStore } from "../lib/store"
import { useRelease } from "../lib/useRelease"
import { I } from "../ui/icons"
import { Addr, Empty, Panel } from "../ui/kit"

type Row = Awaited<ReturnType<typeof reg.releases>>[number]

export function Releases() {
  const { chains, snapshotAt } = useStore()
  const latest = useRelease()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [anchorTx, setAnchorTx] = useState("")
  useEffect(() => {
    if (!hasPublisher) return setRows([])
    reg.releases().then(setRows, () => setRows([]))
    reg.trust().then((t) => setAnchorTx(t.anchorTx), () => {})
  }, [])
  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Releases</h1>
          <p>A release is one signed fingerprint of the entire list. Records that didn't change keep verifying against every new one, without being rewritten.</p>
        </div>
      </div>
      {!rows?.length ? (
        <>
          <section className="panel relhero">
            <span className="rel-i wait">
              <I n="hourglass" s={20} />
            </span>
            <div className="grow">
              <h2>{rows === null || latest.loading ? "Looking for releases…" : "No release signed yet"}</h2>
              <p>Until the first signature lands on Ethereum, no record can be verified, and none is claimed to be.</p>
            </div>
          </section>
          <Panel title="What's in the current copy" className="mt">
            <dl className="props">
              <dt>Networks</dt>
              <dd>{fmt(chains.length)}</dd>
              <dt>Source</dt>
              <dd>
                <a className="lnk" href={UPSTREAM} target="_blank" rel="noreferrer">
                  ethereum-lists/chains
                </a>
              </dd>
              <dt>Copied</dt>
              <dd>{snapshotAt ? new Date(snapshotAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd>
            </dl>
          </Panel>
        </>
      ) : (
        <div className="tl panel" style={{ padding: "12px 16px" }}>
          {rows.map((r, i) => (
            <div className="tl-item" key={String(r.releaseNo)}>
              <span className={`tl-dot ${i === 0 ? "ok" : ""}`}>
                <I n={i === 0 ? "check" : "git-commit"} s={13} />
              </span>
              <div className="grow">
                <div className="t">
                  Release {String(r.releaseNo)}
                  {i === 0 && <span className="badge green" style={{ marginLeft: 8 }}>Latest</span>}
                </div>
                <div className="m">
                  <span>{fmt(r.chainCount)} networks</span>
                  <a className="lnk mono" href={`${UPSTREAM}/commit/${r.commit}`} target="_blank" rel="noreferrer">
                    {r.commit.slice(0, 10)}
                  </a>
                  <span>
                    Root <Addr a={r.root} n={6} />
                  </span>
                  <span>Anchored on {r.anchorNetwork}</span>
                  {latest.anchor && anchorTx && i === 0 && (
                    <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
                      View on Etherscan
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!hasPublisher && (
        <div className="panel mt">
          <Empty sm icon="signature" title="No publisher configured" text="Set VITE_CHAINKIV_ENS when the ENS name is ready." />
        </div>
      )}
    </div>
  )
}
