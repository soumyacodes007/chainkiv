// The "one more click" page: one RPC, in plain words first, with the evidence underneath and a Recheck anyone can run.
import { useEffect, useState } from "react"
import { ago, fmt, hostOf, ms, short, urlHash } from "../lib/format"
import { assess, wasCalled } from "../lib/health"
import { recheck, type Recheck } from "../lib/recheck"
import { reg } from "../lib/registry"
import { href } from "../lib/router"
import { useChain } from "../lib/useChain"
import { useStore } from "../lib/store"
import { Glyph, HealthPill } from "../ui/chain"
import { Ring } from "../ui/charts"
import { I } from "../ui/icons"
import { Addr, Blob, cx, Empty, Panel, useNow } from "../ui/kit"

const HEADLINE: Record<string, string> = {
  passed: "This RPC passed every check",
  stale: "This RPC answers, but its head is stale",
  unconfirmed: "This RPC works, but its first block can't be confirmed",
  "rate-limited": "This RPC asked us to slow down",
  "wrong-chain": "This RPC answers for a different chain",
  "wrong-genesis": "This RPC claims this chain, but its first block differs",
  down: "This RPC isn't answering",
  "needs-key": "This RPC needs a private API key",
  refused: "This RPC points at a private address",
  none: "No one has measured this RPC yet",
  split: "Probers disagree about this RPC",
}

type CheckTone = "ok" | "bad" | "wait"
function Check({ tone, title, text }: { tone: CheckTone; title: string; text: string }) {
  return (
    <div className={cx("chk", tone)}>
      <I n={tone === "ok" ? "circle-check" : tone === "bad" ? "circle-x" : "circle-dashed"} s={18} />
      <div>
        <div className="t">{title}</div>
        <div className="d">{text}</div>
      </div>
    </div>
  )
}

function RecheckPanel({ url, chainId, expectedGenesis, blocked }: { url: string; chainId: string; expectedGenesis?: string; blocked?: string }) {
  useNow(15000)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<Recheck[]>([])
  const last = runs[runs.length - 1]
  const go = async () => {
    setBusy(true)
    const r = await recheck(url)
    setRuns((list) => [...list.slice(-11), r])
    setBusy(false)
  }
  const right = last?.chainId === Number(chainId)
  const max = Math.max(1, ...runs.map((r) => r.latencyMs ?? 0))
  return (
    <Panel
      title="Check it yourself"
      sub="Your browser asks the RPC directly. No prober or server involved."
      acts={
        <button className={cx("btn btn-secondary btn-sm", busy && "is-loading")} disabled={!!blocked} onClick={go}>
          <I n="refresh-cw" s={14} />
          Recheck
        </button>
      }
    >
      {!last ? (
        <p className="faint" style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
          {blocked ?? "Press Recheck to ask for its chain ID, first block and latest block."}
        </p>
      ) : last.state === "ok" ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="recheck-v">
            <I n={right ? "circle-check" : "circle-x"} s={16} style={{ color: right ? "var(--green)" : "var(--red)" }} />
            <span>{right ? `Answered as chain ${chainId}` : `Answered as chain ${last.chainId}, not ${chainId}`}</span>
            <span className="sp" />
            <b>{ms(last.latencyMs!)}</b>
          </div>
          <div className="spark" aria-label="Your recheck round trips">
            {runs.map((r, i) => (
              <i key={i} style={{ height: `${Math.max(8, ((r.latencyMs ?? 0) / max) * 100)}%`, background: r.state === "ok" ? "var(--accent)" : "var(--border-strong)" }} />
            ))}
          </div>
          <dl className="props">
            <dt>Latest block</dt>
            <dd className="num">{fmt(last.head!)}</dd>
            <dt>Block hash</dt>
            <dd>
              <Addr a={last.headHash} n={8} />
            </dd>
            <dt>First block</dt>
            <dd>
              <Addr a={last.genesis} n={8} /> {expectedGenesis && last.genesis !== expectedGenesis ? <span className="badge red">Differs from the reading</span> : null}
            </dd>
          </dl>
        </div>
      ) : (
        <div className="recheck-v">
          <I n={last.state === "blocked" ? "info" : "circle-x"} s={16} style={{ color: last.state === "blocked" ? "var(--text-3)" : "var(--red)" }} />
          <span>{last.error}</span>
        </div>
      )}
    </Panel>
  )
}

export function RpcPage({ chainId, hash }: { chainId: string; hash: string }) {
  useNow(30000)
  const { view } = useChain(chainId)
  const healthFrom = useStore((s) => s.healthFrom)
  const rpc = view?.rpcs.find((r) => urlHash(r.url) === hash)
  const [names, setNames] = useState(new Map<string, string>())
  useEffect(() => {
    reg.probers().then((list) => setNames(new Map(list.filter((p) => p.name).map((p) => [p.address.toLowerCase(), p.name]))), () => {})
  }, [])
  if (!view || !rpc)
    return (
      <div className="page">
        <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <Empty icon="search" title="RPC not found" text="It may have been removed from the list.">
            <a className="btn btn-secondary btn-sm" href={href(`chain/${chainId}`)}>
              Back to the network
            </a>
          </Empty>
        </div>
      </div>
    )
  const a = assess(rpc)
  const { host, path } = hostOf(rpc.url)
  const stats = view.stats.filter((s) => s.url === rpc.url)
  const r = rpc.readings[0]
  const avg = (f: (s: (typeof stats)[number]) => number) => (stats.length ? Math.round((stats.reduce((x, s) => x + f(s), 0) / stats.length) * 1000) / 10 : null)
  const called = wasCalled(r)
  const limited = r?.verdict === "rate-limited"
  const measured = called && !limited
  const stale = r?.verdict === "stale" || (r?.lagBlocks ?? 0) >= 100
  const skip = rpc.needsApiKey ? "Not called, because it needs a private API key" : r?.verdict === "refused" ? "Not called, because it points at a private address" : limited ? "It asked us to slow down, so we didn't count this" : "Not measured yet"
  const blocked = rpc.needsApiKey ? "Recheck is off, because this URL needs a private API key." : r?.verdict === "refused" ? "Recheck is off, because this URL points at a private address." : undefined
  return (
    <div className="page wide">
      <header className={cx("rpch", a.tone)}>
        <div className="rpch-t">
          <Glyph chain={view.chain} size={22} />
          <a className="lnk" href={href(`chain/${chainId}`)}>
            {view.chain.name}
          </a>
          <span className="faint">·</span>
          <span className="mono trunc">
            {host}
            <span className="faint">{path}</span>
          </span>
        </div>
        <h1>{HEADLINE[a.verdict] ?? a.label}</h1>
        <p>{r?.error && a.tone !== "green" ? r.error : a.detail}</p>
        <div className="rpch-m">
          <HealthPill a={a} />
          {a.latency && <span className="tag">{ms(a.latency)}</span>}
          <span className="tag">{rpc.protocol.startsWith("ws") ? "WebSocket" : rpc.protocol.toUpperCase()}</span>
          <span className="tag">{rpc.origin === "list" ? "From EthereumLists" : "Published by the provider"}</span>
          {r && called && <span className="tag">Measured {ago(r.checkedAt)}</span>}
        </div>
      </header>

      {a.tone === "green" && <p className="caveat">Passed checks is not the same as safe. A malicious RPC can forward to a real node and pass all of these.</p>}

      <div className="grid2 mt">
        <div className="stack">
          <Panel title="The four checks">
            <div className="chks">
              <Check tone={!measured ? "wait" : r!.up ? "ok" : "bad"} title="Is it answering?" text={!measured ? skip : r!.up ? "It answered" : (r!.error || "No answer")} />
              <Check tone={!measured || !r!.up ? "wait" : r!.chainIdOk ? "ok" : "bad"} title="Is it the right chain?" text={!measured || !r!.up ? "Needs an answer first" : r!.chainIdOk ? `Reports chain ${chainId}` : "Reports a different chain ID"} />
              <Check tone={!measured || !r!.up ? "wait" : r!.genesis === "bad" ? "bad" : r!.genesis === "ok" ? "ok" : "wait"} title="Is the first block the agreed one?" text={!measured || !r!.up ? "Needs an answer first" : r!.genesis === "bad" ? "Different from what other RPCs report" : r!.genesis === "ok" ? "Matches what other RPCs report" : "Too few RPCs answered to agree on one"} />
              <Check tone={!measured || !r!.up ? "wait" : stale ? "bad" : "ok"} title="Is it keeping up?" text={!measured || !r!.up ? "Needs an answer first" : r!.verdict === "stale" ? "Its newest block is over an hour old" : r!.lagBlocks > 0 ? `${fmt(r!.lagBlocks)} blocks behind the highest head seen` : "At the highest head seen"} />
            </div>
          </Panel>
          <Panel title="Uptime and speed" sub={stats.length ? `From ${stats.length} prober${stats.length > 1 ? "s" : ""}` : "Probers publish this hourly from their own history"}>
            {stats.length ? (
              <>
                <div className="rings">
                  <Ring value={avg((s) => s.uptime24h)} label="24 hours" />
                  <Ring value={avg((s) => s.uptime7d)} label="7 days" />
                </div>
                <div className="stack" style={{ gap: 8, marginTop: 14 }}>
                  {stats.map((s) => {
                    const top = Math.max(...stats.map((x) => x.p95Ms), 1)
                    return (
                      <div key={s.prober} className="prange">
                        <Addr a={s.prober} />
                        <span className="pr-t">
                          <i style={{ left: `${(s.p50Ms / top) * 100}%`, right: `${100 - (s.p95Ms / top) * 100}%` }} />
                        </span>
                        <span className="pr-v">
                          {ms(s.p50Ms)} – {ms(s.p95Ms)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="rings">
                <Ring value={null} label="24 hours" />
                <Ring value={null} label="7 days" />
                <p className="faint ringnote">Appears after probers have collected an hour of readings for this RPC.</p>
              </div>
            )}
          </Panel>
        </div>
        <div className="stack">
          <RecheckPanel url={rpc.url} chainId={chainId} expectedGenesis={r?.genesisSeen || undefined} blocked={blocked} />
          <Panel title="Who measured it" body={false}>
            {called ? (
              rpc.readings.map((x) => (
                <div key={x.prober} className="lrow static">
                  {x.prober === "survey" ? <I n="radio" s={16} className="faint" /> : <Blob a={x.prober} size={18} />}
                  <span className="grow trunc">{x.prober === "survey" ? "Registry survey" : (names.get(x.prober.toLowerCase()) ?? <Addr a={x.prober} />)}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {x.region} · {ago(x.checkedAt)}
                  </span>
                </div>
              ))
            ) : (
              <div className="panel-b">
                <Empty sm icon="radio" title="No readings" text={healthFrom === "none" ? "The first survey is running." : "Nobody has called this RPC."} />
              </div>
            )}
          </Panel>
          {r && r.blockHash && (
            <Panel title="The evidence" sub="A block anyone can look up">
              <dl className="props">
                <dt>Block</dt>
                <dd className="num">{fmt(BigInt(r.blockNumber))}</dd>
                <dt>Block hash</dt>
                <dd>
                  <Addr a={r.blockHash} n={8} />
                </dd>
                <dt>First block</dt>
                <dd>
                  <Addr a={r.genesisSeen} n={8} />
                </dd>
              </dl>
            </Panel>
          )}
          <Panel title="Provider claim" body={false}>
            <div className="lrow static">
              <I n="circle-dashed" s={15} className="faint" />
              <span className="grow">No claim yet</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {short(host, 12)}
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
