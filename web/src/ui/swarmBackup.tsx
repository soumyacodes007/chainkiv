// A release's copy on Swarm. It reads as saved only once the publisher has recorded a reference that rebuilt the signed root.
import { useCallback, useEffect, useState } from "react"
import { checkCopy, copyLink } from "../../../src/swarm"
import { ago, short } from "../lib/format"
import { canSave, readCopy, saveCopy, type Copy } from "../lib/swarm"
import { I } from "./icons"
import { cx, toast } from "./kit"

export function SwarmBackup({ root, latest }: { root: string; latest: boolean }) {
  const [copy, setCopy] = useState<Copy | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const load = useCallback(() => readCopy(root).then(setCopy, () => {}).finally(() => setLoaded(true)), [root])
  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setResult(null)
    try {
      await saveCopy()
      await load()
      toast("Saved on Swarm and recorded on Arkiv")
    } catch (e) {
      setResult({ ok: false, detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const check = async () => {
    setBusy(true)
    setResult(await checkCopy(copy!.reference, root))
    setBusy(false)
  }

  if (!loaded) return null
  return (
    <div className={cx("swm", copy && "on")}>
      <span className="swm-i">
        <I n="database" s={14} />
      </span>
      <div className="grow">
        <div className="swm-t">{copy ? "Saved on Swarm" : "Not on Swarm yet"}</div>
        <div className="swm-d">
          {copy ? (
            <>
              <a className="lnk mono" href={copyLink(copy.reference)} target="_blank" rel="noreferrer">
                {short(copy.reference)}
                <I n="arrow-up-right" s={12} />
              </a>
              {` · Saved ${ago(copy.uploadedAt)} · Recorded on Arkiv`}
            </>
          ) : busy ? (
            "Uploading, then reading it back from Swarm. This can take a few minutes"
          ) : (
            "A copy here outlives Arkiv's testnet and GitHub, and proves itself against Ethereum"
          )}
        </div>
        {result && <div className={result.ok ? "swm-ok" : "swm-bad"}>{result.detail}</div>}
      </div>
      {copy ? (
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={check}>
          <I n={busy ? "loader" : "refresh-cw"} s={13} className={busy ? "spin" : undefined} />
          Check the copy
        </button>
      ) : latest && canSave ? (
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          <I n={busy ? "loader" : "database"} s={13} className={busy ? "spin" : undefined} />
          Save to Swarm
        </button>
      ) : null}
    </div>
  )
}
