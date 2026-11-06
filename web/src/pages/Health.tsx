// The whole list at once: every RPC as one square, why the bad ones fail, and the ones pointing at the wrong chain.
import { useMemo, useState } from "react"
import { ago, fmt, hostOf, ms, pct, urlHash } from "../lib/format"
import { assess, GROUPS, groupOf, works } from "../lib/health"
import { href } from "../lib/router"
import { useStore } from "../lib/store"
import { Glyph } from "../ui/chain"
import { Histogram, Legend, RankBars, Waffle, type Cell, type Part } from "../ui/charts"
import { I } from "../ui/icons"
import { Empty, Panel, Seg } from "../ui/kit"

const REASONS: Record<string, string> = {
  dns: "The address no longer exists",
  timeout: "Too slow to answer",
  http: "Server returned an error",
  tls: "Broken security certificate",
  refused: "Connection refused",
  "rpc-error": "Answered with an error",
  "bad-response": "Answer made no sense",
}

const BINS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2500, Infinity]

export function Health() {
  const { chains, healthFrom, survey } = useStore()
  const [kind, setKind] = useState("all")

  const data = useMemo(() => {
    const scoped = chains.filter((c) => (kind === "main" ? !c.testnet : kind === "test" ? c.testnet : true))
    const rows = scoped.flatMap((chain) => chain.rpcs.map((rpc) => ({ chain, rpc, a: assess(rpc) })))
    rows.sort((x, y) => GROUPS.indexOf(groupOf(x.a.verdict)) - GROUPS.indexOf(groupOf(y.a.verdict)) || (x.a.latency ?? 9e9) - (y.a.latency ?? 9e9))
    const cells: Cell[] = rows.map(({ chain, rpc, a }) => ({ color: groupOf(a.verdict).color, label: hostOf(rpc.url).host, sub: `${chain.name} · ${a.label}${a.latency ? ` · ${ms(a.latency)}` : ""}`, to: href(`rpc/${chain.id}/${urlHash(rpc.url)}`) }))
    const parts: Part[] = GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.color, value: rows.filter((r) => groupOf(r.a.verdict) === g).length }))
    const reasons = new Map<string, number>()
    for (const r of rows) {
      const o = r.rpc.readings[0]?.outcome
      if (r.a.verdict === "down" && o) reasons.set(o, (reasons.get(o) ?? 0) + 1)
    }
    let lo = 0
    const bins = BINS.map((top) => {
      const value = rows.filter((r) => works(r.a.tone) && r.a.latency && r.a.latency > lo && r.a.latency <= top).length
      const label = top === Infinity ? `${lo / 1000}s+` : top >= 1000 ? `${top / 1000}s` : `${top}`
      lo = top
      return { label, value }
    })
    const wrong = rows.filter((r) => groupOf(r.a.verdict).key === "wrong")
    const scopedWith = scoped.filter((c) => c.rpcs.length)
    const noneWork = scopedWith.filter((c) => !c.rpcs.some((r) => works(assess(r).tone)))
    const confirmed = scopedWith.filter((c) => c.rpcs.some((r) => assess(r).tone === "green")).length
    const best = scopedWith.map((c) => ({ c, n: c.rpcs.filter((r) => assess(r).tone === "green").length })).sort((a, b) => b.n - a.n).slice(0, 6)
    return { rows, cells, parts, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), bins, wrong, scopedWith, noneWork, best, confirmed }
  }, [chains, kind])

  if (healthFrom === "none")
    return (
      <div className="page">
        <div className="ph">
          <div>
            <h1>RPC health</h1>
            <p>Which of the listed endpoints answer, on the right chain, right now.</p>
          </div>
        </div>
        <div className="panel">
          <Empty icon="radio" title="The first survey is running" text="Every listed RPC is being checked. A chain ID, a first block and a latest block each, with a second try for anything that fails. Results land here when it finishes." />
        </div>
      </div>
    )

  const total = data.rows.length
  const pass = data.parts[0]!.value
  return (
    <div className="page wide">
      <div className="ph">
        <div>
          <h1>RPC health</h1>
          <p>
            {healthFrom === "survey" && survey ? `One survey from one location, ${ago(Date.parse(survey.at) / 1000)}. A single vantage point can be wrong about one RPC, so read this as the shape of the list.` : "Signed readings from the probers named in the latest release."}
          </p>
        </div>
      </div>
      <div className="filters">
        <Seg label="Network type" value={kind} onChange={setKind} options={[["all", "All networks"], ["main", "Mainnets"], ["test", "Testnets"]]} />
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="k">Passed checks</span>
          <b>{pct(pass, total)}</b>
          <span className="d">
            {fmt(pass)} of {fmt(total)} RPCs
          </span>
        </div>
        <div className="kpi">
          <span className="k">Networks with a working RPC</span>
          <b>{fmt(data.scopedWith.length - data.noneWork.length)}</b>
          <span className="d">of {fmt(data.scopedWith.length)} that list any · {fmt(data.confirmed)} with a confirmed first block</span>
        </div>
        <div className="kpi">
          <span className="k">Networks where nothing works</span>
          <b>{fmt(data.noneWork.length)}</b>
          <span className="d">RPCs are listed, but none work</span>
        </div>
        <div className="kpi">
          <span className="k">Pointing at the wrong chain</span>
          <b>{fmt(data.wrong.length)}</b>
          <span className="d">Answer, but for another network</span>
        </div>
      </div>

      <Panel title="Every listed RPC" sub="One square each, sorted by result. Select one to open it." className="mt">
        <Waffle cells={data.cells} />
        <Legend parts={data.parts} />
      </Panel>

      <div className="grid2eq mt">
        <Panel title="Why they don't answer">
          {data.reasons.length ? <RankBars color="var(--red)" rows={data.reasons.map(([k, v]) => ({ key: k, label: REASONS[k] ?? k, value: v }))} /> : <Empty sm icon="circle-check" title="No failures in this view" />}
        </Panel>
        <Panel title="How fast the working ones are" sub="Median round trip, in milliseconds">
          <Histogram bins={data.bins} color="var(--green)" />
        </Panel>
      </div>

      <div className="grid2eq mt">
        <Panel title="Pointing at the wrong chain" sub="Listed for one network, but answering as another" body={false}>
          {data.wrong.length ? (
            <div className="scrollp">
              {data.wrong.slice(0, 40).map(({ chain, rpc, a }) => (
                <a key={rpc.url} className="lrow" href={href(`rpc/${chain.id}/${urlHash(rpc.url)}`)}>
                  <Glyph chain={chain} size={20} />
                  <span className="grow trunc">{chain.name}</span>
                  <span className="faint trunc wronghost">
                    {hostOf(rpc.url).host}
                  </span>
                  <span className="badge violet">{a.label}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="panel-b">
              <Empty sm icon="circle-check" title="None in this view" />
            </div>
          )}
        </Panel>
        <Panel title="Most working RPCs" sub="Networks with the most endpoints that pass">
          <RankBars color="var(--green)" rows={data.best.map(({ c, n }) => ({ key: c.id, label: c.name, value: n, href: href(`chain/${c.id}`) }))} />
          <div className="note">
            <I n="info" s={14} />
            Passing means checked, never safe. A malicious RPC can forward to a real node and pass every one.
          </div>
        </Panel>
      </div>
    </div>
  )
}
