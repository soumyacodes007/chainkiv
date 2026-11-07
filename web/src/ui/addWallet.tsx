// Adds a network to the visitor's wallet. Only RPCs that passed checks are offered, so a chain with none can't be added.
import { useState } from "react"
import { toHex } from "viem"
import { bestRpcs } from "../lib/health"
import type { ChainRow } from "../lib/types"
import { addToWallet } from "../lib/wallet"
import { I } from "./icons"
import { cx, toast } from "./kit"

export function AddWallet({ c, compact = false, primary = false }: { c: ChainRow; compact?: boolean; primary?: boolean }) {
  const [busy, setBusy] = useState(false)
  const good = bestRpcs(c.rpcs)
  const reason = !c.rpcs.length ? "This network lists no RPCs" : !good.length ? "No listed RPC has passed every check yet" : ""
  const add = async () => {
    setBusy(true)
    try {
      await addToWallet({
        chainId: toHex(BigInt(c.id)),
        chainName: c.name,
        nativeCurrency: c.file?.nativeCurrency ?? { name: c.symbol, symbol: c.symbol, decimals: 18 },
        rpcUrls: good.map((g) => g.rpc.url).slice(0, 4),
        blockExplorerUrls: c.explorers.map((e) => e.url).slice(0, 1),
      })
      toast(`${c.name} added to your wallet`)
    } catch (e) {
      toast((e as Error).message.split("\n")[0]!.slice(0, 120), { kind: "err" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className={cx("addw", compact && "compact")} data-tip={reason || (compact ? "Add to wallet" : undefined)}>
      <button className={compact ? "ibtn ibtn-sm" : primary ? "btn btn-primary" : "btn btn-secondary btn-sm btn-block"} disabled={!!reason || busy} onClick={add} aria-label={`Add ${c.name} to wallet`}>
        <I n="wallet" s={14} />
        {!compact && "Add to wallet"}
      </button>
    </span>
  )
}
