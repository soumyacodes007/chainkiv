// The checks answer "is this the signed record?", and that only changes with a new release. So each browser keeps the
// answer: until ENS names a new release, or an hour passes. Selecting Check again always runs them for real.
import { useCallback, useEffect, useState } from "react"
import { reg, runVerify, type Verdict } from "./registry"

const HOUR = 3_600_000
/** A check that couldn't run may work soon, but retrying on every view is what spends GitHub's hourly limit. */
const COULD_NOT_RUN = 300_000
/** Past this a wait needs explaining. Verify sits out Arkiv's limit, which can take minutes. */
const SLOW_AFTER = 12_000

type Saved = { verdict: Verdict; anchorTx: string; at: number }

const keyOf = (id: string) => `chainkiv.verdict.${id}`
const keepFor = (v: Verdict) => (v.state === "incomplete" ? COULD_NOT_RUN : HOUR)

function saved(id: string): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(keyOf(id)) ?? "null") as Saved | null
  } catch {
    return null
  }
}

function recall(id: string, anchorTx: string): Saved | null {
  const found = saved(id)
  return found && found.anchorTx === anchorTx && Date.now() - found.at < keepFor(found.verdict) ? found : null
}

function forget(id: string) {
  try {
    localStorage.removeItem(keyOf(id))
  } catch {
    /* storage blocked: the next run just isn't remembered */
  }
}

async function check(id: string): Promise<Saved> {
  const anchorTx = (await reg.trust().catch(() => null))?.anchorTx ?? ""
  const known = recall(id, anchorTx)
  if (known) return known
  const fresh = { verdict: await runVerify(id), anchorTx, at: Date.now() }
  try {
    localStorage.setItem(keyOf(id), JSON.stringify(fresh))
  } catch {
    /* storage blocked: keep it for this view */
  }
  return fresh
}

// Everything on the page shares one run, so a badge and a box can never disagree.
const running = new Map<string, Promise<Saved>>()
function run(id: string) {
  let found = running.get(id)
  if (!found) {
    found = check(id).finally(() => running.delete(id))
    running.set(id, found)
  }
  return found
}

export type Check = { verdict: Verdict | null; anchorTx: string; publisher: string; checkedAt: number | null; slow: boolean; retry: () => void }

export function useVerdict(id: string): Check {
  const [shown, setShown] = useState<Saved | null>(null)
  const [slow, setSlow] = useState(false)
  const [publisher, setPublisher] = useState("")
  const [anchorTx, setAnchorTx] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!id) return
    let on = true
    // The last answer stays up, with its age, while this one is confirmed against ENS.
    setShown(saved(id))
    setSlow(false)
    const timer = setTimeout(() => on && setSlow(true), SLOW_AFTER)
    reg.trust().then(
      (t) => {
        if (!on) return
        setAnchorTx(t.anchorTx)
        setPublisher(t.publisher)
      },
      () => {},
    )
    void run(id).then((s) => {
      clearTimeout(timer)
      if (!on) return
      setShown(s)
      setSlow(false)
    })
    return () => {
      on = false
      clearTimeout(timer)
    }
  }, [id, attempt])
  const retry = useCallback(() => {
    forget(id)
    reg.forgetRelease()
    setAttempt((n) => n + 1)
  }, [id])
  return { verdict: shown?.verdict ?? null, anchorTx, publisher, checkedAt: shown?.at ?? null, slow, retry }
}
