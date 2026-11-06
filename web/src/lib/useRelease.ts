// The latest anchored release, checked against Ethereum. Shared, so several panels cost one read.
import { useEffect, useState } from "react"
import type { Anchor } from "../../../src/release"
import { hasPublisher, reg } from "./registry"

type Release = { loading: boolean; anchor: Anchor | null; error?: string }

let cached: Promise<Release> | undefined
const load = () =>
  (cached ??= (async (): Promise<Release> => {
    if (!hasPublisher) return { loading: false, anchor: null, error: "No publisher configured yet" }
    try {
      const check = await reg.release()
      const failed = check.steps.find((s) => s.status !== "pass")
      return { loading: false, anchor: check.anchor ?? null, error: failed?.detail }
    } catch (e) {
      return { loading: false, anchor: null, error: (e as Error).message }
    }
  })())

export function useRelease(): Release {
  const [state, setState] = useState<Release>({ loading: true, anchor: null })
  useEffect(() => {
    let on = true
    void load().then((r) => on && setState(r))
    return () => {
      on = false
    }
  }, [])
  return state
}
