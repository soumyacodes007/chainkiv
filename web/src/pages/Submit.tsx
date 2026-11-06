// Propose a chain or an RPC. The same checks the validator runs happen here first, so people see problems before signing.
import { useState } from "react"
import { ExpirationTime } from "@arkiv-network/sdk"
import { bytes, str, u64 } from "@arkiv-network/sdk/schema"
import { Proposal } from "../../../src/schemas"
import { ARKIV_EXPLORER } from "../lib/format"
import { probeChainId } from "../lib/recheck"
import { href } from "../lib/router"
import { setUi, useStore } from "../lib/store"
import { I } from "../ui/icons"
import { cx, Field, Panel, Seg, toast } from "../ui/kit"

type Form = { chainId: string; name: string; shortName: string; symbol: string; rpc: string; explorer: string; note: string }
const BLANK: Form = { chainId: "", name: "", shortName: "", symbol: "", rpc: "", explorer: "", note: "" }

export function Submit() {
  const { wallet, byId, chains } = useStore()
  const [kind, setKind] = useState("rpc")
  const [mode, setMode] = useState("form")
  const [f, setF] = useState(BLANK)
  const [json, setJson] = useState("")
  const [probe, setProbe] = useState<{ url: string; id: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")
  const up = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  let parsed: Record<string, any> | null = null
  let jsonError = ""
  if (mode === "json" && json.trim()) {
    try {
      const value = JSON.parse(json)
      if (typeof value !== "object" || value === null || Array.isArray(value)) jsonError = "Paste one chain, as a JSON object"
      else if (value.rpc !== undefined && !(Array.isArray(value.rpc) && value.rpc.every((u: unknown) => typeof u === "string"))) jsonError = "rpc must be a list of URLs"
      else parsed = value
    } catch {
      jsonError = "That isn't valid JSON"
    }
  }
  const body = mode === "json" ? (parsed ?? {}) : { chainId: f.chainId.trim(), name: f.name, shortName: f.shortName, nativeCurrency: { name: f.symbol, symbol: f.symbol, decimals: 18 }, rpc: f.rpc ? [f.rpc] : [], explorers: f.explorer ? [{ url: f.explorer, name: "explorer", standard: "none" }] : [] }
  const typed = String(body.chainId ?? "")
  // Kept as a string, so a large chain ID stays exact.
  const id = /^[1-9]\d*$/.test(typed) && BigInt(typed) < 2n ** 64n ? typed : ""
  const rpc: string = body.rpc?.[0] ?? ""
  const rpcOk = /^(https?|wss?):\/\/[^\s/]+/i.test(rpc)
  const shortName: string = body.shortName ?? ""
  const existing = id ? byId.get(id) : undefined
  const nameTaken = shortName ? chains.find((c) => c.short.toLowerCase() === shortName.toLowerCase()) : undefined

  const checks: [string, boolean, string][] = [
    [kind === "rpc" ? "The chain exists" : "The chain ID is free", kind === "rpc" ? !!existing : !!id && !existing, !id ? (typed ? "A chain ID is a whole number above 0" : "Enter a chain ID") : kind === "rpc" ? (existing ? existing.name : "No listed chain has this ID") : existing ? `Already used by ${existing.name}` : "Unused"],
    ...(kind === "chain" ? ([["The short name is free", !!shortName && !nameTaken, nameTaken ? `Already used by ${nameTaken.name}` : shortName ? "Unused" : "Enter a short name"]] as [string, boolean, string][]) : []),
    ["The RPC answers with this chain ID", !!probe && probe.url === rpc && String(probe.id) === id, !rpc ? "Enter an RPC URL" : !rpcOk ? "That doesn't look like an RPC URL" : probe?.url !== rpc ? "Press Test RPC" : probe.id === null ? "Your browser couldn't reach it. The validator will try from its own server." : String(probe.id) === id ? "Answered correctly" : `Answered as chain ${probe.id}`],
  ]

  // The RPC check may stay unmet when a browser can't reach it, because the validator retries from its own server.
  const ready = !!id && rpcOk && !jsonError && (kind === "rpc" ? !!existing : !existing && !!shortName && !nameTaken)

  const test = async () => {
    setBusy(true)
    setProbe({ url: rpc, id: await probeChainId(rpc) })
    setBusy(false)
  }

  const submit = async () => {
    if (!wallet) return setUi({ modal: "connect" })
    setBusy(true)
    try {
      const raw = new TextEncoder().encode(JSON.stringify(body))
      const result = await wallet.client.executeBatch({
        creates: [{ schema: Proposal, values: { kind: str(kind), targetChainId: u64(BigInt(id)), shortName: str(shortName), note: str(f.note.slice(0, 120)), raw: bytes(raw) }, expiration: ExpirationTime.fromDays(14) }],
      })
      setSent(typeof result === "string" ? result : (result?.txHash ?? "submitted"))
      toast("Proposal written to Arkiv")
    } catch (e) {
      toast((e as Error).message.split("\n")[0]!.slice(0, 140), { kind: "err" })
    }
    setBusy(false)
  }

  if (sent)
    return (
      <div className="page">
        <section className="panel relhero">
          <span className="rel-i ok">
            <I n="check" s={20} />
          </span>
          <div className="grow">
            <h2>Your proposal is on Arkiv</h2>
            <p>The automatic validator isn't running yet, so it stays in the unreviewed area and expires in 14 days unless it's taken up.</p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <a className="btn btn-primary btn-sm" href={href("proposals")}>
                See proposals
              </a>
              {sent.startsWith("0x") && (
                <a className="btn btn-secondary btn-sm" href={`${ARKIV_EXPLORER}/tx/${sent}`} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    )

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>New proposal</h1>
          <p>No GitHub account needed. Your proposal is public and signed by your wallet.</p>
        </div>
      </div>
      <div className="submit">
        <Panel title="What are you proposing?">
          <div className="stack" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Seg label="Proposal kind" value={kind} onChange={setKind} options={[["rpc", "An RPC for a listed chain"], ["chain", "A new chain"]]} />
              <span className="sp" />
              <Seg label="Input" value={mode} onChange={setMode} options={[["form", "Form"], ["json", "Paste JSON"]]} />
            </div>
            {mode === "json" ? (
              <Field label="Chain JSON" hint="The same format as an EthereumLists file" err={jsonError}>
                <textarea className="textarea mono" rows={12} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "chainId": 123, "name": "…", "shortName": "…", "rpc": ["https://…"] }' />
              </Field>
            ) : (
              <>
                <div className="fgrid">
                  <Field label="Chain ID">
                    <input className="input" inputMode="numeric" value={f.chainId} onChange={up("chainId")} placeholder="8453" />
                  </Field>
                  <Field label="RPC URL">
                    <input className="input" value={f.rpc} onChange={up("rpc")} placeholder="https://rpc.example.org" />
                  </Field>
                  {kind === "chain" && (
                    <>
                      <Field label="Name">
                        <input className="input" value={f.name} onChange={up("name")} placeholder="Example Network" />
                      </Field>
                      <Field label="Short name">
                        <input className="input" value={f.shortName} onChange={up("shortName")} placeholder="example" />
                      </Field>
                      <Field label="Currency symbol">
                        <input className="input" value={f.symbol} onChange={up("symbol")} placeholder="ETH" />
                      </Field>
                      <Field label="Explorer (optional)">
                        <input className="input" value={f.explorer} onChange={up("explorer")} placeholder="https://scan.example.org" />
                      </Field>
                    </>
                  )}
                </div>
                <Field label="Note (optional)" hint="Up to 120 characters">
                  <input className="input" maxLength={120} value={f.note} onChange={up("note")} placeholder="Why this should be listed" />
                </Field>
              </>
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel title="Before you sign">
            <div className="checks">
              {checks.map(([t, ok, d]) => (
                <div key={t} className={cx("c", ok ? "ok" : "warn")}>
                  <I n={ok ? "circle-check" : "circle-dashed"} s={15} />
                  <div>
                    <div style={{ color: "var(--text)", fontWeight: 500 }}>{t}</div>
                    <div>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              <button className={cx("btn btn-secondary btn-block", busy && "is-loading")} disabled={!rpcOk} onClick={test}>
                <I n="radio" s={14} />
                Test RPC
              </button>
              <button className={cx("btn btn-primary btn-block", busy && "is-loading")} disabled={!ready} onClick={submit}>
                <I n={wallet ? "send" : "wallet"} s={14} />
                {wallet ? "Sign and submit" : "Connect a wallet to submit"}
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
