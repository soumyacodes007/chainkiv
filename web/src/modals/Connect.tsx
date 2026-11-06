// Connect a browser wallet. Only needed to submit a proposal.
import { useEffect, useState } from "react"
import { setUi, setWallet } from "../lib/store"
import { connect, discoverWallets, type Injected } from "../lib/wallet"
import { I } from "../ui/icons"
import { Empty, Modal, toast } from "../ui/kit"

export function ConnectModal() {
  const [list, setList] = useState<Injected[]>([])
  const [busy, setBusy] = useState("")
  useEffect(() => discoverWallets(setList), [])
  const close = () => setUi({ modal: null })
  const pick = async (w: Injected) => {
    setBusy(w.id)
    try {
      setWallet(await connect(w))
      close()
    } catch (e) {
      toast((e as Error).message.split("\n")[0]!.slice(0, 120), { kind: "err" })
    }
    setBusy("")
  }
  return (
    <Modal title="Connect a wallet" sub="Reading never needs a wallet. It's only used to sign a proposal on Arkiv Rabdi." onClose={close}>
      <div className="stack" style={{ gap: 8 }}>
        {list.length ? (
          list.map((w) => (
            <button key={w.id} className="wopt" disabled={!!busy} onClick={() => pick(w)}>
              {w.icon ? (
                <img src={w.icon} alt="" />
              ) : (
                <span className="wicon">
                  <I n="wallet" s={16} />
                </span>
              )}
              <div className="grow">
                <div className="t">{w.name}</div>
                <div className="d">{busy === w.id ? "Check your wallet…" : "Switches to Arkiv Rabdi"}</div>
              </div>
              <I n="chevron-right" s={15} />
            </button>
          ))
        ) : (
          <Empty sm icon="wallet" title="No wallet found" text="Install a browser wallet to sign proposals. Everything else works without one." />
        )}
      </div>
    </Modal>
  )
}
