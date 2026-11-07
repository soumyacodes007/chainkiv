// Right data, right publisher. Seven checks run in this browser, drawn as one unbroken chain from the file to Ethereum.
import { useEffect, useState } from "react"
import { ETH_EXPLORER, publisherName, reg, runVerify, type Step, type Verdict } from "../lib/registry"
import { href } from "../lib/router"
import { useStore } from "../lib/store"
import { Glyph } from "../ui/chain"
import { NOT_PROVEN, PROVES, Result, StepRow, waitingSteps } from "../ui/checks"
import { I } from "../ui/icons"
import { Empty } from "../ui/kit"

export function Verify({ id }: { id: string }) {
  const chain = useStore((s) => s.byId.get(id))
  const [v, setV] = useState<Verdict | null>(null)
  const [shown, setShown] = useState(0)
  const [anchorTx, setAnchorTx] = useState("")

  useEffect(() => {
    let on = true
    let timer: ReturnType<typeof setInterval>
    reg.trust().then((t) => on && setAnchorTx(t.anchorTx), () => {})
    void runVerify(id).then((result) => {
      if (!on) return
      setV(result)
      // Reveal one by one so the chain of checks can be read as it completes.
      timer = setInterval(() => setShown((n) => (n >= 7 ? (clearInterval(timer), n) : n + 1)), 170)
    })
    return () => {
      on = false
      clearInterval(timer)
    }
  }, [id])

  if (!chain)
    return (
      <div className="page">
        <div className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
          <Empty icon="search" title={`No network with ID ${id}`} />
        </div>
      </div>
    )

  const steps = v?.steps ?? waitingSteps()
  const lanes: [string, string, Step[]][] = [
    ["Right publisher", "Is this who it claims to be?", steps.filter((s) => s.group === "publisher")],
    ["Right data", "Is this exactly what they signed?", steps.filter((s) => s.group === "data")],
  ]
  const done = !!v && shown >= steps.length
  let offset = 0
  return (
    <div className="page">
      <header className="vh">
        <Glyph chain={chain} size={44} />
        <div className="grow">
          <h1>Can you trust {chain.name}'s record?</h1>
          <p>Nothing here relies on our server. Your browser reads Arkiv and Ethereum and does the maths itself.</p>
        </div>
      </header>

      {done ? <Result v={v!} /> : <div className="vresult gray"><I n="loader" s={22} className="spin" /><div><div className="t">Checking…</div><div className="d">Reading Ethereum and Arkiv from this browser</div></div></div>}

      <div className="vlanes">
        {lanes.map(([title, sub, list]) => {
          const start = offset
          offset += list.length
          return (
            <section key={title} className="panel vlane">
              <div className="panel-h">
                <div>
                  <h2>{title}</h2>
                  <p className="panel-sub">{sub}</p>
                </div>
              </div>
              <ol className="vsteps">
                {list.map((s, i) => (
                  <StepRow key={s.id} step={s} shown={!!v && shown > start + i} last={i === list.length - 1} />
                ))}
              </ol>
            </section>
          )
        })}
      </div>

      <div className="demopub">
        <I n="signature" s={15} />
        <span>
          <b>Signed by demo publisher.</b> In this version the key is the Chainroll team's, {publisherName ? `named by ${publisherName}` : "not the EthereumLists maintainers'"}. They can take over later by pointing the ENS name at their own key, and no app has to change.
        </span>
        {anchorTx && (
          <a className="lnk" href={`${ETH_EXPLORER}/tx/${anchorTx}`} target="_blank" rel="noreferrer">
            View the signature
          </a>
        )}
      </div>

      <div className="grid2eq mt">
        <section className="panel">
          <div className="panel-h">
            <h2>What a pass proves</h2>
          </div>
          <div className="panel-b checks">
            {PROVES.map((t) => (
              <div key={t} className="c ok">
                <I n="check" s={14} />
                {t}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2>What a pass doesn't prove</h2>
          </div>
          <div className="panel-b checks">
            {NOT_PROVEN.map((t) => (
              <div key={t} className="c warn">
                <I n="info" s={14} />
                {t}
              </div>
            ))}
          </div>
        </section>
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        {chain.id} · {chain.short} ·{" "}
        <a className="lnk" href={href(`chain/${id}`)}>
          Back to {chain.name}
        </a>
      </p>
    </div>
  )
}
