// Wallets are only needed to submit a proposal; reading never asks for one. Found with EIP-6963, then switched to Rabdi.
import { createWalletClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { custom, toHex } from "viem"
import { ARKIV_EXPLORER } from "./format"

export type Injected = { id: string; name: string; icon?: string; provider: any }

const found = new Map<string, Injected>()

export function discoverWallets(onChange: (list: Injected[]) => void) {
  const emit = () => {
    const list = [...found.values()]
    const eth = (window as any).ethereum
    if (!list.length && eth) list.push({ id: "injected", name: eth.isMetaMask ? "MetaMask" : "Browser wallet", provider: eth })
    onChange(list)
  }
  const announce = (e: any) => {
    const { info, provider } = e.detail ?? {}
    if (!info?.uuid) return
    found.set(info.rdns || info.uuid, { id: info.rdns || info.uuid, name: info.name, icon: info.icon, provider })
    emit()
  }
  addEventListener("eip6963:announceProvider", announce)
  dispatchEvent(new Event("eip6963:requestProvider"))
  emit()
  return () => removeEventListener("eip6963:announceProvider", announce)
}

const chain = rabdi({ accessKey: "" })
const CHAIN_HEX = toHex(chain.id)

export async function connect(wallet: Injected) {
  const provider = wallet.provider
  const [address] = (await provider.request({ method: "eth_requestAccounts" })) as string[]
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] })
  } catch (e: any) {
    if (e?.code !== 4902 && !/unrecognized|not added|unknown chain/i.test(e?.message ?? "")) throw e
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: CHAIN_HEX, chainName: "Arkiv Rabdi", nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [ARKIV_EXPLORER] }],
    })
  }
  const client = createWalletClient({ chain, transport: custom(provider), account: address as `0x${string}` })
  return { name: wallet.name, address: address!, client }
}

/** Adds a network to the visitor's wallet. Callers pass only RPCs that passed checks. */
export async function addToWallet(params: { chainId: string; chainName: string; nativeCurrency: unknown; rpcUrls: string[]; blockExplorerUrls: string[] }) {
  const eth = (window as any).ethereum
  if (!eth) throw new Error("No browser wallet found")
  await eth.request({ method: "wallet_addEthereumChain", params: [params] })
}
