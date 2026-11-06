// Hash routes, so the app is a static site: #/chains, #/chain/8453, #/rpc/8453/ab12cd, #/verify/8453.
import { useSyncExternalStore } from "react"

export type Route = { name: string; params: Record<string, string>; seq: number }

function parse(): Omit<Route, "seq"> {
  const [a, b, c] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)
  if (!a) return { name: "overview", params: {} }
  if (a === "chain" && b) return { name: "chain", params: { id: b } }
  if (a === "rpc" && b && c) return { name: "rpc", params: { chainId: b, urlHash: c } }
  if (a === "verify" && b) return { name: "verify", params: { id: b } }
  if (a === "proposals" && b === "new") return { name: "submit", params: {} }
  if (["chains", "health", "releases", "proposals", "about"].includes(a)) return { name: a, params: {} }
  return { name: "notfound", params: {} }
}

let seq = 0
let route: Route = { ...parse(), seq }
const subs = new Set<() => void>()
addEventListener("hashchange", () => {
  route = { ...parse(), seq: ++seq }
  subs.forEach((f) => f())
  const content = document.querySelector<HTMLElement>(".content")
  content?.scrollTo(0, 0)
  content?.focus({ preventScroll: true })
})

export const useRoute = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => route,
  )
export const go = (path: string) => {
  location.hash = "#/" + path.replace(/^\//, "")
}
export const href = (path: string) => "#/" + path.replace(/^\//, "")
