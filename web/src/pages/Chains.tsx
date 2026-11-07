// Every network: fuzzy search on the loaded list, filters people care about, cards or a dense table.
import { useMemo, useState } from "react"
import { fmt, plural } from "../lib/format"
import { assess, toneVar, works } from "../lib/health"
import { href } from "../lib/router"
import { searchChains } from "../lib/search"
import { useStore } from "../lib/store"
import { AddWallet } from "../ui/addWallet"
import { ChainCard, Glyph, LayerTag } from "../ui/chain"
import { Dots } from "../ui/charts"
import { I } from "../ui/icons"
import { Empty, Seg, Select } from "../ui/kit"

const PAGE = 48

export function Chains() {
  const chains = useStore((s) => s.chains)
  const healthFrom = useStore((s) => s.healthFrom)
  const [q, setQ] = useState("")
  const [kind, setKind] = useState("main")
  const [layer, setLayer] = useState("any")
  const [status, setStatus] = useState("any")
  const [flag, setFlag] = useState("any")
  const [view, setView] = useState("cards")
  const [shown, setShown] = useState(PAGE)

  const [list, hidden] = useMemo(() => {
    const everywhere = searchChains(chains, q)
    let out = everywhere
    if (layer !== "any") out = out.filter((c) => c.layer === layer)
    if (status !== "any") out = out.filter((c) => c.status === status)
    if (flag === "reused") out = out.filter((c) => c.reused)
    if (flag === "norpc") out = out.filter((c) => !c.rpcs.length)
    if (flag === "working") out = out.filter((c) => c.rpcs.some((r) => works(assess(r).tone)))
    const inKind = kind === "main" ? out.filter((c) => !c.testnet) : kind === "test" ? out.filter((c) => c.testnet) : out
    return [inKind, out.length - inKind.length]
  }, [chains, q, kind, layer, status, flag])

  const reset = (f: (v: string) => void) => (v: string) => {
    f(v)
    setShown(PAGE)
  }
  return (
    <div className="page wide">
      <div className="ph">
        <div>
          <h1>Networks</h1>
          <p>{fmt(chains.length)} EVM networks from EthereumLists. Search them, filter them, and open any one to see its proof and its RPCs.</p>
        </div>
      </div>
      <div className="filters">
        <div className="fsearch">
          <I n="search" s={14} />
          <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Name, short name, chain ID, currency" aria-label="Search networks" />
        </div>
        <Seg label="Network type" value={kind} onChange={reset(setKind)} options={[["main", "Mainnets"], ["test", "Testnets"], ["all", "All"]]} />
        <Select ariaLabel="Layer" value={layer} onChange={reset(setLayer)} style={{ width: 150 }} options={[{ value: "any", label: "Any layer" }, { value: "L1", label: "No parent listed" }, { value: "L2", label: "Layer 2" }, { value: "shard", label: "Shard" }]} />
        <Select ariaLabel="Status" value={status} onChange={reset(setStatus)} style={{ width: 130 }} options={[{ value: "any", label: "Any status" }, { value: "active", label: "Active" }, { value: "incubating", label: "Incubating" }, { value: "deprecated", label: "Deprecated" }]} />
        <Select ariaLabel="Flags" value={flag} onChange={reset(setFlag)} style={{ width: 170 }} options={[{ value: "any", label: "Everything" }, ...(healthFrom === "none" ? [] : [{ value: "working", label: "Has a working RPC" }]), { value: "norpc", label: "No RPC listed" }, { value: "reused", label: "Reused chain ID" }]} />
        <span className="sp" />
        <Seg label="View" value={view} onChange={setView} options={[["cards", <I key="c" n="layout-dashboard" s={13} />, undefined, "Cards view"], ["rows", <I key="r" n="list-filter" s={13} />, undefined, "Rows view"]]} />
      </div>
      <div className="resct">
        {plural(list.length, "network")}
        {hidden > 0 && (
          <button className="lnk" onClick={() => setKind("all")}>
            and {fmt(hidden)} more in {kind === "main" ? "testnets" : "mainnets"}
          </button>
        )}
      </div>
      {!list.length ? (
        <div className="panel">
          <Empty icon="search" title={hidden ? "Nothing in this view" : "Nothing matches"} text={hidden ? "Use the link above to see the other matches." : "Loosen a filter, or tell us about a network that's missing."}>
            <a className="btn btn-secondary btn-sm" href={href("proposals/new")}>
              Propose this chain
            </a>
          </Empty>
        </div>
      ) : view === "cards" ? (
        <div className="cgrid">
          {list.slice(0, shown).map((c) => (
            <ChainCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <div className="panel rowsp">
          {list.slice(0, shown).map((c) => (
            <div key={c.id} className="crowp">
              <a className="crow" href={href(`chain/${c.id}`)}>
                <Glyph chain={c} size={26} />
                <span className="grow trunc n">{c.name}</span>
                <span className="c-id num hide-sm">{c.id}</span>
                <span className="c-s hide-sm">{c.symbol}</span>
                <span className="hide-sm">
                  <LayerTag c={c} />
                </span>
                <span className="c-d hide-sm">
                  <Dots tones={c.rpcs.map((r) => toneVar(assess(r).tone))} max={10} />
                </span>
                <I n="chevron-right" s={14} className="faint" />
              </a>
              <AddWallet c={c} compact />
            </div>
          ))}
        </div>
      )}
      {shown < list.length && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setShown((s) => s + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
