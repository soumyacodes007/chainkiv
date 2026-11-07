// A network's page: is it real, how do I connect, and which of its RPCs work right now.
import { useMemo, useState } from "react"
import { ago, hostOf, ms, pct, plural, urlHash } from "../lib/format"
import { assess, toneVar } from "../lib/health"
import { href } from "../lib/router"
import { togglePin, useStore } from "../lib/store"
import { useChain } from "../lib/useChain"
import { useVerdict } from "../lib/useVerdict"
import { AddWallet } from "../ui/addWallet"
import { Glyph, HealthPill, TrustBadge } from "../ui/chain"
import { hover, Legend, SegBar, TipRow, type Part } from "../ui/charts"
import { I } from "../ui/icons"
import { Code, Empty, Panel, Seg } from "../ui/kit"
import { TrustBox } from "../ui/trust"

function RpcList({ view }: { view: NonNullable<ReturnType<typeof useChain>["view"]> }) {
  const { chain, rpcs } = view
  const [filter, setFilter] = useState("all")
  const rows = useMemo(() => {
    const order = { green: 0, teal: 1, amber: 2, gray: 3, violet: 4, red: 5 }
    return rpcs.map((rpc) => ({ rpc, a: assess(rpc) })).sort((x, y) => order[x.a.tone] - order[y.a.tone] || (x.a.latency ?? 9e9) - (y.a.latency ?? 9e9))
  }, [rpcs])
  const shown = filter === "pass" ? rows.filter((r) => r.a.tone === "green") : rows
  const slowest = Math.max(1, ...rows.map((r) => r.a.latency ?? 0))
  const survey = useStore((s) => s.survey)
  const healthFrom = useStore((s) => s.healthFrom)
  if (!rpcs.length)
    return (
      <Panel title="Ways to connect">
        <Empty sm icon="unplug" title="No RPCs listed" text="This network has no public endpoint in the registry." />
      </Panel>
    )
  return (
    <Panel
      title="Ways to connect"
      sub={`${rows.filter((r) => r.a.tone === "green").length} of ${rows.length} listed RPCs passed checks`}
      body={false}
      acts={<Seg label="Filter RPCs" value={filter} onChange={setFilter} options={[["all", "All"], ["pass", "Passing"]]} />}
    >
      {shown.length ? (
        <div>
          {shown.map(({ rpc, a }) => {
            const { host, path } = hostOf(rpc.url)
            return (
              <a key={rpc.url} className="rpcrow" href={href(`rpc/${chain.id}/${urlHash(rpc.url)}`)}>
                <span className="hd" style={{ "--c": toneVar(a.tone) } as object} />
                <span className="rh">
                  <b className="trunc">{host}</b>
                  {path && <span className="trunc">{path}</span>}
                </span>
                <span className="rp hide-sm">{rpc.protocol.startsWith("ws") ? "WebSocket" : "HTTP"}</span>
                <span className="rl hide-sm">
                  {a.latency ? (
                    <span {...hover(<TipRow value={ms(a.latency)} label="Round trip, median of three calls" color={toneVar(a.tone)} />)}>
                      <i style={{ width: `${Math.max(4, (a.latency / slowest) * 100)}%`, background: toneVar(a.tone) }} />
                    </span>
                  ) : null}
                  <em>{a.latency ? ms(a.latency) : ""}</em>
                </span>
                <span className="rs">
                  <HealthPill a={a} />
                </span>
                <I n="chevron-right" s={14} className="faint" />
              </a>
            )
          })}
        </div>
      ) : (
        <div className="panel-b">
          <Empty sm icon="radio" title="None passing right now" text="Switch to All to see why." />
        </div>
      )}
      {healthFrom === "survey" && survey && (
        <div className="panel-b">
          <div className="note">
            <I n="info" s={14} />
            From one survey at one location, {ago(Date.parse(survey.at) / 1000)}. Live readings from two probers will replace this.
          </div>
        </div>
      )}
    </Panel>
  )
}

function Family({ id }: { id: string }) {
  const chains = useStore((s) => s.chains)
  const byId = useStore((s) => s.byId)
  const c = byId.get(id)!
  const parent = c.parent ? byId.get(c.parent) : undefined
  const kids = useMemo(() => chains.filter((x) => x.parent === id), [chains, id])
  if (!parent && !kids.length) return null
  const Node = ({ x }: { x: typeof c }) => (
    <a className="fnode" href={href(`chain/${x.id}`)}>
      <Glyph chain={x} size={22} />
      <span className="trunc">{x.name}</span>
    </a>
  )
  return (
    <Panel title="Family" sub={kids.length ? `${plural(kids.length, "network")} built on this one` : "Settles on its parent"}>
      <div className="family">
        {parent && (
          <>
            <Node x={parent} />
            <span className="fline" />
          </>
        )}
        <div className="fnode me">
          <Glyph chain={c} size={22} />
          <span className="trunc">{c.name}</span>
        </div>
        {kids.length > 0 && <span className="fline" />}
        {kids.length > 0 && (
          <div className="fkids">
            {kids.slice(0, 6).map((k) => (
              <Node key={k.id} x={k} />
            ))}
            {kids.length > 6 && (
              <span className="fmore">and {kids.length - 6} more</span>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}

const FEATURE_NAMES: Record<string, string> = { EIP155: "Replay protection", EIP1559: "Modern fees", EIP4844: "Blobs", EIP7702: "Smart accounts" }

export function ChainPage({ id }: { id: string }) {
  const { view } = useChain(id)
  const check = useVerdict(view ? id : "")
  const pins = useStore((s) => s.prefs.pins)
  const healthFrom = useStore((s) => s.healthFrom)
  const [raw, setRaw] = useState(false)
  if (!view)
    return (
      <div className="page">
        <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <Empty icon="search" title={`No network with ID ${id}`} text="It may not be listed yet.">
            <a className="btn btn-secondary btn-sm" href={href("proposals/new")}>
              Propose this chain
            </a>
          </Empty>
        </div>
      </div>
    )
  const { chain, file, rpcs, explorers, stats } = view
  const assessed = rpcs.map((r) => assess(r))
  const count = (t: string) => assessed.filter((a) => a.tone === t).length
  const parts: Part[] = [
    { key: "g", label: "Passed checks", value: count("green"), color: "var(--green)" },
    { key: "t", label: "Works, first block unconfirmed", value: count("teal"), color: "var(--teal)" },
    { key: "a", label: "Needs a look", value: count("amber"), color: "var(--amber)" },
    { key: "v", label: "Wrong chain or genesis", value: count("violet"), color: "var(--violet)" },
    { key: "r", label: "Not answering", value: count("red"), color: "var(--red)" },
    { key: "n", label: "Not checked", value: count("gray"), color: "var(--text-4)" },
  ]
  const fastest = Math.min(...assessed.filter((a) => a.tone === "green" && a.latency).map((a) => a.latency!))
  const features = (file?.features ?? []).map((f) => f.name)
  const pinned = pins.includes(chain.id)
  const uptime = stats.length ? stats.reduce((a, s) => a + s.uptime24h, 0) / stats.length : null
  return (
    <div className="page wide">
      <header className="chh">
        <Glyph chain={chain} size={64} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1>{chain.name}</h1>
          <div className="chh-m">
            <TrustBadge state={check.verdict?.state ?? "checking"} />
            {chain.status !== "unset" && <span className="tag">{chain.status}</span>}
            {chain.reused && (
              <span className="badge amber">
                <I n="triangle-alert" s={12} />
                Reused chain ID
              </span>
            )}
            {chain.conflict && (
              <span className="badge red">
                <I n="triangle-alert" s={12} />
                ID conflict
              </span>
            )}
          </div>
        </div>
        <div className="chh-a">
          <button className="ibtn" onClick={() => togglePin(chain.id)} data-tip={pinned ? "Unpin" : "Pin to sidebar"} aria-label={pinned ? "Unpin" : "Pin"}>
            <I n={pinned ? "pin-off" : "pin"} s={15} />
          </button>
          <AddWallet c={{ ...chain, rpcs, explorers, file }} primary />
        </div>
      </header>

      <div className="facts">
        <div>
          <span>Chain ID</span>
          <b className="num">{chain.id}</b>
        </div>
        <div>
          <span>Currency</span>
          <b>{chain.symbol || "—"}</b>
        </div>
        <div>
          <span>Fastest passing RPC</span>
          <b>{isFinite(fastest) ? ms(fastest) : "—"}</b>
        </div>
        <div>
          <span>RPCs passing</span>
          <b>{healthFrom === "none" ? "—" : `${count("green")} of ${rpcs.length}`}</b>
        </div>
        {uptime !== null && (
          <div>
            <span>Uptime, 24 hours</span>
            <b>{pct(uptime, 1, 1)}</b>
          </div>
        )}
      </div>

      <div className="grid2 mt">
        <div className="stack">
          <RpcList view={view} />
          {file && (
            <Panel
              title="The original file"
              sub="Exactly what EthereumLists publishes"
              acts={
                <button className="btn btn-sm btn-ghost" onClick={() => setRaw(!raw)}>
                  <I n="file-json" s={14} />
                  {raw ? "Hide" : "Show"}
                </button>
              }
              body={raw}
            >
              {raw ? <Code>{JSON.stringify(file, null, 2)}</Code> : null}
            </Panel>
          )}
        </div>
        <div className="stack">
          <TrustBox chain={chain} check={check} rpcs={rpcs} />
          {rpcs.length > 0 && healthFrom !== "none" && (
            <Panel title="RPC health">
              <SegBar parts={parts} />
              <Legend parts={parts.filter((p) => p.value)} />
            </Panel>
          )}
          <Family id={chain.id} />
          <Panel title="Details">
            <dl className="props">
              <dt>Short name</dt>
              <dd className="mono">{chain.short}</dd>
              {file?.nativeCurrency?.name && (
                <>
                  <dt>Currency name</dt>
                  <dd>{file.nativeCurrency.name}</dd>
                </>
              )}
              {file?.infoURL && (
                <>
                  <dt>Website</dt>
                  <dd>
                    <a className="lnk" href={file.infoURL} target="_blank" rel="noreferrer nofollow">
                      {hostOf(file.infoURL).host}
                    </a>
                  </dd>
                </>
              )}
              {features.length > 0 && (
                <>
                  <dt>Supports</dt>
                  <dd className="chips">
                    {features.slice(0, 6).map((f) => (
                      <span key={f} className="tag" title={f}>
                        {FEATURE_NAMES[f] ?? f}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </Panel>
          {explorers.length > 0 && (
            <Panel title="Explorers" body={false}>
              {explorers.map((e) => (
                <a key={e.url} className="lrow" href={e.url} target="_blank" rel="noreferrer nofollow">
                  <I n="compass" s={14} className="faint" />
                  <span className="grow trunc">{e.name || hostOf(e.url).host}</span>
                  <I n="arrow-up-right" s={13} className="faint" />
                </a>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
