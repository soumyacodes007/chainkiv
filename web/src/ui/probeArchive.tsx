// Arkiv keeps only each RPC's latest reading, so these snapshots are the history. Each keeps the probers' signatures,
// so anyone can confirm a snapshot wasn't edited, without trusting this site or Swarm.
import { useCallback, useEffect, useState } from "react"
import { checkArchive, copyLink } from "../../../src/swarm"
import { ago, fmt, short } from "../lib/format"
import { reg } from "../lib/registry"
import { canSave, readSnapshots, saveSnapshot, type Snapshot } from "../lib/swarm"
import { I } from "./icons"
import { Panel, toast } from "./kit"

function Row({ snapshot }: { snapshot: Snapshot }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const check = async () => {
    setBusy(true)
    const probers = await reg.probers().catch(() => [])
    setResult(await checkArchive(snapshot.reference, probers.map((p) => p.address)))
    setBusy(false)
  }
  return (
    <div className="parc-row">
      <b className="grow">
        {fmt(snapshot.readings)} signed readings · {ago(snapshot.takenAt)}
      </b>
      <a className="lnk mono" href={copyLink(snapshot.reference)} target="_blank" rel="noreferrer">
        {short(snapshot.reference)}
        <I n="arrow-up-right" s={12} />
      </a>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={check}>
        <I n={busy ? "loader" : "refresh-cw"} s={13} className={busy ? "spin" : undefined} />
        Check signatures
      </button>
      {result && <span className={result.ok ? "swm-ok" : "swm-bad"}>{result.detail}</span>}
    </div>
  )
}

export function ProbeArchive() {
  const [rows, setRows] = useState<Snapshot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const load = useCallback(() => readSnapshots().then(setRows, () => setRows([])), [])
  useEffect(() => {
    void load()
  }, [load])
  const save = async () => {
    setBusy(true)
    setProblem("")
    try {
      await saveSnapshot()
      await load()
      toast("Snapshot saved on Swarm")
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt">
      <Panel
        title="Probe history on Swarm"
        sub="Arkiv keeps only each RPC's latest reading. These signed snapshots keep the past"
        body={false}
        acts={
          canSave ? (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={save}>
              <I n={busy ? "loader" : "database"} s={13} className={busy ? "spin" : undefined} />
              {busy ? "Saving…" : "Save a snapshot"}
            </button>
          ) : undefined
        }
      >
        {rows?.length ? rows.slice(0, 6).map((s) => <Row key={s.reference} snapshot={s} />) : <p className="parc-e">{rows ? "No snapshots yet" : "Looking for snapshots…"}</p>}
        {problem && <p className="parc-e swm-bad">{problem}</p>}
      </Panel>
    </div>
  )
}
