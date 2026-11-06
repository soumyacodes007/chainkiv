// Home: the question people arrive with, the search that answers it, and the state of the whole registry at a glance.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { fmt, pct, short } from "../lib/format"
import { rankOf, searchChains } from "../lib/search"
import { GROUPS } from "../lib/health"
import { useStore } from "../lib/store"
import { go, href } from "../lib/router"
import { useRelease } from "../lib/useRelease"
import { Atlas, onEthereum } from "../ui/atlas"
import { ChainCard, Glyph } from "../ui/chain"
import { Legend, RankBars, SegBar, type Part } from "../ui/charts"
import { I } from "../ui/icons"
import { Empty, Panel } from "../ui/kit"

const QUICK: [string, string][] = [
  ["1", "Ethereum"],
  ["8453", "Base"],
  ["42161", "Arbitrum"],
  ["137", "Polygon"],
  ["10", "OP Mainnet"],
]

function Search() {
  const chains = useStore((s) => s.chains)
  const [q, setQ] = useState("")
  const [hl, setHl] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const results = useMemo(() => (q.trim() ? searchChains(chains, q).slice(0, 6) : []), [q, chains])
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setQ("")
    addEventListener("mousedown", away)
    return () => removeEventListener("mousedown", away)
  }, [])
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setHl((h) => Math.min(results.length - 1, h + 1)))
    else if (e.key === "ArrowUp") (e.preventDefault(), setHl((h) => Math.max(0, h - 1)))
    else if (e.key === "Escape") setQ("")
    else if (e.key === "Enter") {
      const c = results[hl]
      if (c) go(`chain/${c.id}`)
    }
  }
  return (
    <div className="bigsearch" ref={box}>
      <div className="bs-in">
        <I n="search" s={18} />
        <input value={q} onChange={(e) => (setQ(e.target.value), setHl(0))} onKeyDown={key} placeholder="Search a network or chain ID" aria-label="Search networks" autoComplete="off" />
      </div>
      {q.trim() && (
        <div className="bs-pop">
          {results.length ? (
            results.map((c, i) => (
              <a key={c.id} className={i === hl ? "hl" : ""} href={href(`chain/${c.id}`)} onMouseEnter={() => setHl(i)}>
                <Glyph chain={c} size={26} />
                <span className="grow trunc">{c.name}</span>
                <span className="faint num">{c.id}</span>
              </a>
            ))
          ) : (
            <div className="bs-none">
              <span>No network called “{q}”.</span>
              <a className="btn btn-secondary btn-sm" href={href("proposals/new")}>
                Propose this chain
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Hero() {
  const { chains, byId, healthFrom } = useStore()
  return (
    <section className="ovh">
      <div className="ovh-l">
        <h1>
          Is this the real chain?
          <br />
          <span>Does this RPC work?</span>
        </h1>
        <p>The list wallets use to set up networks, rebuilt so you can check it. See who published each record, trace it back to its source, and see which RPCs passed live checks.</p>
        <Search />
        <div className="quick">
          {QUICK.map(([id, name]) => {
            const c = byId.get(id)
            return (
              c && (
                <a key={id} className="chipbtn" href={href(`chain/${id}`)}>
                  <Glyph chain={c} size={15} />
                  {name}
                </a>
              )
            )
          })}
        </div>
      </div>
      <div className="ovh-r">
        <Atlas chains={chains} byId={byId} healthKnown={healthFrom !== "none"} />
        <p className="atlas-c">
          Ethereum and {chains.filter(onEthereum).length} networks built on it. Bigger dots list more RPCs.
          {healthFrom !== "none" && " Green passed checks, teal works but its first block is unconfirmed, red has nothing answering."}
        </p>
      </div>
    </section>
  )
}

function Numbers() {
  const { chains, rollup, healthFrom, survey } = useStore()
  const rpcs = rollup?.total ?? 0
  const mains = chains.filter((c) => !c.testnet).length
  const l2 = chains.filter((c) => c.layer === "L2" && !c.testnet).length
  return (
    <div className="kpis">
      <a className="kpi" href={href("chains")}>
        <span className="k">
          <I n="globe" s={14} />
          Networks
        </span>
        <b>{fmt(chains.length)}</b>
        <SegBar parts={[{ key: "m", label: "Mainnets", value: mains, color: "var(--accent)" }, { key: "t", label: "Testnets", value: chains.length - mains, color: "var(--text-4)" }]} />
        <span className="d">
          {fmt(mains)} mainnets, {fmt(l2)} of them layer 2s · {fmt(chains.length - mains)} testnets
        </span>
      </a>
      <a className="kpi" href={href("health")}>
        <span className="k">
          <I n="server" s={14} />
          RPCs listed
        </span>
        <b>{fmt(rpcs)}</b>
        <span className="d">{fmt(chains.filter((c) => !c.rpcs.length).length)} networks list none at all</span>
      </a>
      <a className="kpi" href={href("health")}>
        <span className="k">
          <I n="activity" s={14} />
          RPCs that pass
        </span>
        {healthFrom === "none" || !rollup ? (
          <>
            <b className="faint">—</b>
            <span className="d">First survey in progress</span>
          </>
        ) : (
          <>
            <b>{pct(rollup.green, rollup.total)}</b>
            <span className="d">
              {fmt(rollup.green)} of {fmt(rollup.total)}
              {healthFrom === "probers" ? " · signed readings" : survey ? " · last survey" : " · live"}
            </span>
          </>
        )}
      </a>
      <LatestRelease />
    </div>
  )
}

function LatestRelease() {
  const release = useRelease()
  return (
    <a className="kpi" href={href("releases")}>
      <span className="k">
        <I n="signature" s={14} />
        Latest signed release
      </span>
      {release.anchor ? (
        <>
          <b>#{release.anchor.releaseNo}</b>
          <span className="d">
            {fmt(release.anchor.chainCount)} networks · commit {short(release.anchor.commit, 3).replace("0x", "")}
          </span>
        </>
      ) : (
        <>
          <b className="faint">{release.loading ? "…" : "Not yet"}</b>
          <span className="d">{release.loading ? "Checking Ethereum" : "Nothing counts as verified until the first signature"}</span>
        </>
      )}
    </a>
  )
}

function Reach() {
  const { rollup, healthFrom } = useStore()
  if (healthFrom === "none" || !rollup?.total)
    return (
      <Panel title="Which RPCs actually work?" className="fill">
        <Empty sm icon="radio" title="The first survey is running" text="Every listed RPC is being checked for the right chain, the agreed first block and a current head. Results appear here as soon as it finishes." />
      </Panel>
    )
  const parts: Part[] = GROUPS.map((g) => ({ key: g.key, label: g.label, color: g.color, value: g.verdicts.reduce((n, v) => n + (rollup.byVerdict[v] ?? 0), 0) }))
  return (
    <Panel
      title="Which RPCs actually work?"
      className="fill"
      acts={
        <a className="btn btn-sm btn-ghost" href={href("health")}>
          See all
        </a>
      }
    >
      <div className="hero-num">
        <b>{pct(rollup.green, rollup.total)}</b>
        <span>of listed RPCs passed every check, including an agreed first block. Passed means checked, never safe.</span>
      </div>
      <SegBar parts={parts} tall />
      <Legend parts={parts} />
    </Panel>
  )
}

function TrustPath() {
  const release = useRelease()
  const nodes: [string, string, string][] = [
    ["github", "Upstream file", "The chain's JSON on GitHub"],
    ["database", "Arkiv record", "Byte for byte, with its git hash"],
    ["git-branch", "Release", "All chains in one Merkle tree"],
    ["signature", "Ethereum signature", release.anchor ? `Release #${release.anchor.releaseNo}` : "Waiting for the first anchor"],
  ]
  return (
    <Panel title="Where a record's trust comes from" className="fill">
      <ol className="tpath">
        {nodes.map(([icon, t, d], i) => (
          <li key={t}>
            <span className={`tp-i ${i === 3 && !release.anchor ? "wait" : ""}`}>
              <I n={icon} s={15} />
            </span>
            <div>
              <div className="t">{t}</div>
              <div className="d">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <a className="btn btn-secondary btn-sm" href={href("verify/8453")} style={{ marginTop: 12 }}>
        <I n="shield-check" s={14} />
        Try it on Base
      </a>
    </Panel>
  )
}

function Popular() {
  const chains = useStore((s) => s.chains)
  const top = useMemo(() => [...chains].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, 8), [chains])
  return (
    <>
      <div className="sech">
        <h2>Popular networks</h2>
        <a className="btn btn-sm btn-ghost" href={href("chains")}>
          All {fmt(chains.length)}
          <I n="arrow-right" s={13} />
        </a>
      </div>
      <div className="cgrid">
        {top.map((c) => (
          <ChainCard key={c.id} c={c} />
        ))}
      </div>
    </>
  )
}

function Shape() {
  const chains = useStore((s) => s.chains)
  const { layers, status, currencies } = useMemo(() => {
    const count = (f: (c: (typeof chains)[number]) => string) => {
      const m = new Map<string, number>()
      for (const c of chains) m.set(f(c), (m.get(f(c)) ?? 0) + 1)
      return m
    }
    const s = count((c) => c.status)
    const sym = [...count((c) => c.symbol).entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]).slice(0, 6)
    return {
      layers: [
        { key: "l1", label: "No parent listed", value: chains.filter((c) => c.layer === "L1" && !c.testnet).length },
        { key: "l2", label: "Layer 2s", value: chains.filter((c) => c.layer === "L2" && !c.testnet).length },
        { key: "t", label: "Testnets", value: chains.filter((c) => c.testnet).length },
        { key: "s", label: "Shards", value: chains.filter((c) => c.layer === "shard" && !c.testnet).length },
      ],
      status: [
        { key: "active", label: "Active", value: s.get("active") ?? 0, color: "var(--green)" },
        { key: "inc", label: "Incubating", value: s.get("incubating") ?? 0, color: "var(--accent)" },
        { key: "dep", label: "Deprecated", value: s.get("deprecated") ?? 0, color: "var(--amber)" },
        { key: "unset", label: "Never stated", value: s.get("unset") ?? 0, color: "var(--text-4)" },
      ],
      currencies: sym.map(([k, v]) => ({ key: k, label: k, value: v })),
    }
  }, [chains])
  return (
    <div className="grid3 mt">
      <Panel title="What kind of networks">
        <RankBars rows={layers} />
      </Panel>
      <Panel title="Paid for in" sub="Native currency, by number of networks">
        <RankBars rows={currencies} />
      </Panel>
      <Panel title="Stated lifecycle" sub="Most entries never say">
        <SegBar parts={status} />
        <Legend parts={status} />
      </Panel>
    </div>
  )
}

export function Overview() {
  return (
    <div className="page wide">
      <Hero />
      <Numbers />
      <div className="grid2 mt">
        <Reach />
        <TrustPath />
      </div>
      <Popular />
      <Shape />
    </div>
  )
}
