// Arkiv has exact and prefix queries, so fuzzy search runs on the loaded list. Best matches first.
import type { ChainRow } from "./types"

const FAMOUS = ["1", "8453", "42161", "10", "137", "56", "43114", "324", "59144", "534352", "100", "250", "11155111"]

export const rankOf = (c: ChainRow) => {
  const i = FAMOUS.indexOf(c.id)
  return i < 0 ? 1000 - Math.min(c.rpcs.length * 10, 900) + (c.testnet ? 500 : 0) + (c.status === "deprecated" ? 800 : 0) : i
}

export function searchChains(chains: ChainRow[], text: string) {
  const q = text.trim().toLowerCase()
  if (!q) return [...chains].sort((a, b) => rankOf(a) - rankOf(b))
  const scored: [number, ChainRow][] = []
  for (const c of chains) {
    const name = c.name.toLowerCase()
    const shortName = c.short.toLowerCase()
    let s = -1
    if (c.id === q) s = 0
    else if (name === q || shortName === q) s = 1
    else if (name.startsWith(q)) s = 2
    else if (shortName.startsWith(q)) s = 3
    else if (c.symbol.toLowerCase() === q) s = 4
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) s = 5
    else if (c.id.startsWith(q)) s = 6
    else if (name.includes(q)) s = 7
    if (s >= 0) scored.push([s * 2000 + rankOf(c), c])
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, c]) => c)
}
