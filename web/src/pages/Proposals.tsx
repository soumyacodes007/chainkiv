// Anyone can propose. Nothing here reaches the main views until a validator has looked at it.
import { useEffect, useMemo, useState } from "react"
import { short } from "../lib/format"
import { readProposals, type ProposalRow } from "../lib/registry"
import { href } from "../lib/router"
import { useStore } from "../lib/store"
import { Glyph } from "../ui/chain"
import { I } from "../ui/icons"
import { Empty, Panel, Seg } from "../ui/kit"

const VERDICT: Record<string, [string, string]> = { valid: ["green", "Passed validation"], accepted: ["green", "Accepted"], invalid: ["red", "Rejected"], unreviewed: ["gray", "Waiting for review"] }

export function Proposals() {
  const chains = useStore((s) => s.chains)
  const [rows, setRows] = useState<ProposalRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState("unreviewed")
  useEffect(() => {
    readProposals().then(setRows, () => (setRows([]), setFailed(true)))
  }, [])
  const list = (rows ?? []).filter((r) => (tab === "unreviewed" ? r.verdict === "unreviewed" : r.verdict !== "unreviewed"))
  const conflicts = useMemo(() => chains.filter((c) => c.reused).slice(0, 8), [chains])
  return (
    <div className="page wide">
      <div className="ph">
        <div>
          <h1>Proposals</h1>
          <p>Add a chain or an RPC without a GitHub account. The automatic validator isn't running yet, so proposals stay unreviewed, and the list only changes through the upstream maintainers.</p>
        </div>
        <div className="acts">
          <a className="btn btn-primary" href={href("proposals/new")}>
            <I n="plus" s={14} />
            New proposal
          </a>
        </div>
      </div>
      <div className="grid2">
        <Panel
          title="Submitted"
          body={false}
          sub="Unverified by default. Junk expires by itself after 14 days."
          acts={<Seg label="Proposal state" value={tab} onChange={setTab} options={[["unreviewed", "Unreviewed", rows ? rows.filter((r) => r.verdict === "unreviewed").length : ""], ["reviewed", "Reviewed", rows ? rows.filter((r) => r.verdict !== "unreviewed").length : ""]]} />}
        >
          {list.length ? (
            list.map((p) => {
              const [c, label] = VERDICT[p.verdict] ?? ["gray", p.verdict]
              return (
                <div key={p.key} className="prow">
                  <span className="pk">
                    <I n={p.kind === "rpc" ? "server" : "globe"} s={15} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="t trunc">
                      {p.kind === "rpc" ? "New RPC for chain" : "New chain"} {p.target} {p.shortName && <span className="faint">· {p.shortName}</span>}
                    </div>
                    <div className="d trunc">
                      {p.reasons || p.note || "No note"} · from <span className="mono">{short(p.owner)}</span>
                    </div>
                  </div>
                  <span className={`badge ${c}`}>{label}</span>
                </div>
              )
            })
          ) : (
            <div className="panel-b">
              <Empty sm icon={failed ? "wifi-off" : "send"} title={rows === null ? "Reading Arkiv…" : failed ? "Couldn't reach Arkiv" : tab === "unreviewed" ? "Nothing waiting" : "No reviews yet"} text={failed ? "Try again in a moment." : "Be the first to propose a chain or an RPC."} />
            </div>
          )}
        </Panel>
        <div className="stack">
          <Panel title="How a proposal is checked">
            <ol className="tpath">
              {[
                ["send", "You sign it", "Stored on Arkiv from your wallet, for 14 days"],
                ["radio", "Its RPC must answer", "With the chain ID you proposed"],
                ["scale", "No clashes", "Chain ID and short name must be unused"],
                ["github", "Then a pull request", "Upstream stays the source of truth"],
              ].map(([icon, t, d]) => (
                <li key={t}>
                  <span className="tp-i">
                    <I n={icon!} s={15} />
                  </span>
                  <div>
                    <div className="t">{t}</div>
                    <div className="d">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Reused chain IDs" sub="Upstream flags these. More than one network has used the number." body={false}>
            {conflicts.map((c) => (
              <a key={c.id} className="lrow" href={href(`chain/${c.id}`)}>
                <Glyph chain={c} size={20} />
                <span className="grow trunc">{c.name}</span>
                <span className="faint num" style={{ fontSize: 12 }}>
                  {c.id}
                </span>
              </a>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  )
}
