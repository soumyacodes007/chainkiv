// One chain in full. With live records it reads Arkiv (the raw file, RPCs, explorers, signed health and stats);
// otherwise it uses the cached row. The page never has to care which.
import { useEffect, useState } from "react"
import type { Stats } from "../../../src/client"
import type { ChainFile } from "../../../src/derive"
import { readExplorers, reg } from "./registry"
import { getState, useStore } from "./store"
import type { ChainRow, ExplorerRow, RpcRow } from "./types"

export type ChainView = { chain: ChainRow; file?: ChainFile; rpcs: RpcRow[]; explorers: ExplorerRow[]; stats: Stats[]; fromArkiv: boolean }

export function useChain(id: string): { view: ChainView | null; loading: boolean } {
  const row = useStore((s) => s.byId.get(id))
  const live = useStore((s) => s.source === "arkiv")
  const [extra, setExtra] = useState<Partial<ChainView>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!live || !row) return
    let on = true
    setLoading(true)
    void (async () => {
      const chainId = BigInt(id)
      const [detail, rpcs, explorers, health, stats] = await Promise.all([reg.getChain(chainId), reg.rpcs(chainId), readExplorers(id), reg.health(chainId).catch(() => []), reg.stats(chainId).catch(() => [])])
      if (!on) return
      const row = getState().byId.get(id)
      const cached = row?.rpcs ?? []
      // Arkiv can briefly hold fewer rows than the cached copy, and a row it hasn't got must not disappear from the page.
      setExtra({
        file: detail?.file,
        explorers: explorers.length >= (row?.explorers.length ?? 0) ? explorers : row!.explorers,
        stats,
        fromArkiv: true,
        rpcs: [...new Map(rpcs.map((r) => [r.url, r])).values()].map((r) => {
          const signed = health.filter((h) => h.url === r.url).map((h) => ({ ...h, blockNumber: String(h.blockNumber) }))
          return { ...r, readings: signed.length ? signed : (cached.find((c) => c.url === r.url)?.readings ?? []) }
        }),
      })
      setLoading(false)
    })().catch(() => on && setLoading(false))
    return () => {
      on = false
    }
  }, [id, live, row])

  if (!row) return { view: null, loading: false }
  return { loading, view: { chain: row, file: extra.file ?? row.file, rpcs: extra.rpcs ?? row.rpcs, explorers: extra.explorers ?? row.explorers, stats: extra.stats ?? [], fromArkiv: !!extra.fromArkiv } }
}
