// Formatting shared by every page.
import { keccak256, toHex } from "viem"

export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network"
export const UPSTREAM = "https://github.com/ethereum-lists/chains"

export const short = (a?: string, n = 4) => (a ? (a.length <= 2 * n + 3 ? a : `${a.slice(0, 2 + n)}…${a.slice(-n)}`) : "")
export const fmt = (n: number | bigint) => Number(n).toLocaleString("en-US")
export const compact = (n: number) => (n < 10_000 ? fmt(n) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n))
export const pct = (part: number, whole: number, digits = 0) => (whole ? `${((part / whole) * 100).toFixed(digits)}%` : "0%")
export const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)

export function ago(seconds: number) {
  const s = Math.max(0, Date.now() / 1000 - seconds)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const urlHash = (url: string) => keccak256(toHex(url)).slice(2, 14)

/** Splits an RPC URL into the part people recognise and the rest. */
export function hostOf(url: string) {
  try {
    const u = new URL(url)
    const path = decodeURI(u.pathname + u.search).replace(/\/$/, "")
    return { host: decodeURI(u.host), path, secure: u.protocol === "https:" || u.protocol === "wss:" }
  } catch {
    return { host: url, path: "", secure: false }
  }
}

export const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`

export const sameAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
