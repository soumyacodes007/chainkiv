// One app-wide store. On load it shows the cached copy at once, then upgrades to Arkiv if the publisher's full set of
// records is there. It always knows, and says, where the numbers on screen came from.
import { useSyncExternalStore } from "react"
import { deriveExplorers, deriveRpcs } from "../../../src/derive"
import { assess, works, type Rollup } from "./health"
import { hasPublisher, isTestnet, readDirectory, reg, TrustFailure } from "./registry"
import type { ChainRow, Reading, Snapshot, SurveyInfo, Verdict } from "./types"

const PREFS = "chainkiv.prefs"
const read = <T,>(key: string, fallback: T): T => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "{}") }
  } catch {
    return fallback
  }
}

export type Wallet = { name: string; address: string; client: any } | null
export type ArkivStatus = { state: "checking" | "live" | "importing" | "no-publisher" | "down" | "limited" | "unconfirmed"; found?: number; message?: string }
export type Prefs = { theme: "system" | "light" | "dark"; pins: string[] }

type State = {
  ready: boolean
  failed: boolean
  chains: ChainRow[]
  byId: Map<string, ChainRow>
  source: "none" | "cached" | "arkiv"
  snapshotAt: string | null
  survey: SurveyInfo | null
  healthFrom: "none" | "survey" | "probers"
  rollup: Rollup | null
  arkiv: ArkivStatus
  prefs: Prefs
  wallet: Wallet
  ui: { palette: boolean; modal: string | null; collapsed: boolean; mnav: boolean }
}

let state: State = {
  ready: false,
  failed: false,
  chains: [],
  byId: new Map(),
  source: "none",
  snapshotAt: null,
  survey: null,
  healthFrom: "none",
  rollup: null,
  arkiv: { state: "checking" },
  prefs: read<Prefs>(PREFS, { theme: "system", pins: ["1", "8453", "42161", "10", "137"] }),
  wallet: null,
  ui: { palette: false, modal: null, collapsed: false, mnav: false },
}

const subs = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}
export const getState = () => state
export const setUi = (patch: Partial<State["ui"]>) => set({ ui: { ...state.ui, ...patch } })
export const setWallet = (wallet: Wallet) => set({ wallet })
export function setPrefs(patch: Partial<Prefs>) {
  const prefs = { ...state.prefs, ...patch }
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs))
  } catch {
    /* storage blocked: keep it for this visit */
  }
  set({ prefs })
}
export const togglePin = (id: string) => setPrefs({ pins: state.prefs.pins.includes(id) ? state.prefs.pins.filter((p) => p !== id) : [...state.prefs.pins, id] })

export function useStore(): State
export function useStore<T>(pick: (s: State) => T): T
export function useStore<T>(pick?: (s: State) => T) {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => (pick ? pick(state) : state),
  )
}

function rollupOf(chains: ChainRow[]): Rollup {
  const out: Rollup = { total: 0, green: 0, teal: 0, amber: 0, violet: 0, red: 0, gray: 0, chainsLive: 0, chainsDead: 0, byVerdict: {} }
  for (const c of chains) {
    let working = 0
    for (const rpc of c.rpcs) {
      const a = assess(rpc)
      out.total++
      out[a.tone]++
      out.byVerdict[a.verdict] = (out.byVerdict[a.verdict] ?? 0) + 1
      if (works(a.tone)) working++
    }
    if (c.rpcs.length) {
      if (working) out.chainsLive++
      else out.chainsDead++
    }
  }
  return out
}

function fromSnapshot(snap: Snapshot): ChainRow[] {
  return snap.chains.map((file) => {
    const id = String(file.chainId)
    const parent = /^eip155-(\d+)$/.exec(file.parent?.chain ?? "")?.[1]
    const agreed = snap.survey?.genesis?.[id]?.hash
    return {
      id,
      name: file.name,
      short: file.shortName,
      symbol: file.nativeCurrency?.symbol ?? "",
      layer: file.parent?.type ?? "L1",
      status: file.status ?? "unset",
      parent,
      family: file.chain ?? "",
      reused: (file.redFlags ?? []).includes("reusedChainId"),
      conflict: false,
      testnet: isTestnet(file.name, file.shortName, file.title),
      file,
      explorers: deriveExplorers(file).map((e) => ({ name: e.name, url: e.url, standard: e.standard })),
      rpcs: deriveRpcs(file).map((r) => {
        const row = snap.readings[`${id}|${r.url}`]
        const readings: Reading[] = row
          ? [
              {
                prober: "survey",
                region: "one survey run",
                verdict: row[0] as Verdict,
                latencyMs: row[1],
                lagBlocks: row[2],
                blockNumber: row[3],
                blockHash: row[4],
                genesisSeen: row[5],
                checkedAt: row[6],
                error: row[7],
                outcome: row[8],
                up: ["passed", "stale", "wrong-chain", "wrong-genesis"].includes(row[0]),
                chainIdOk: row[0] !== "wrong-chain",
                genesis: row[0] === "wrong-genesis" ? "bad" : agreed ? "ok" : "unknown",
              },
            ]
          : []
        return { url: r.url, protocol: r.protocol, needsApiKey: r.needsApiKey, origin: r.origin, readings }
      }),
    }
  })
}

const index = (chains: ChainRow[]) => new Map(chains.map((c) => [c.id, c]))

async function loadLive(expected: number, attempt = 1): Promise<void> {
  if (!hasPublisher) return set({ arkiv: { state: "no-publisher" } })
  try {
    // Reading every record is over a hundred requests. When the signed release is the commit this copy was built from,
    // the list can't differ, so visitors keep their quota for what changes: signed readings and the pages they open.
    const signed = await reg.latestRelease().catch(() => null)
    if (signed && signed.commit === state.survey?.commit && signed.chainCount === state.chains.length) {
      set({ source: "arkiv", arkiv: { state: "live", found: state.chains.length } })
      return void loadProbers(state.chains)
    }
    const chains = await readDirectory((found) => set({ arkiv: { state: "checking", found } }))
    // Live only once Arkiv holds at least everything the cached copy does, RPCs included.
    const count = (list: ChainRow[]) => list.reduce((n, c) => n + c.rpcs.length, 0)
    if (!chains.length || chains.length < expected || count(chains) < count(state.chains)) return set({ arkiv: { state: "importing", found: chains.length } })
    const old = state.byId
    for (const c of chains) {
      const cached = old.get(c.id)
      // Survey readings stay attached until signed prober readings replace them.
      for (const r of c.rpcs) r.readings = cached?.rpcs.find((x) => x.url === r.url)?.readings ?? []
      c.testnet = cached?.testnet ?? c.testnet
      c.explorers = cached?.explorers ?? []
      c.file = cached?.file
    }
    set({ chains, byId: index(chains), source: "arkiv", rollup: rollupOf(chains), arkiv: { state: "live", found: chains.length } })
    void loadProbers(chains)
  } catch (e) {
    // A full read is over a hundred requests, so one failed page shouldn't cost the visitor live data.
    if (attempt < 3) {
      setTimeout(() => void loadLive(expected, attempt + 1), 15_000)
      return
    }
    const error = e as { status?: number; cause?: { status?: number }; message?: string }
    const limited = error.status === 429 || error.cause?.status === 429
    set({ arkiv: { state: e instanceof TrustFailure ? "unconfirmed" : limited ? "limited" : "down", message: error.message?.split("\n")[0]?.slice(0, 160) } })
  }
}

/** Pulls every signed reading once the anchored prober list exists. */
async function loadProbers(chains: ChainRow[]) {
  const named = await reg.probers().catch(() => [])
  if (!named.length) return
  set({ healthFrom: "probers" })
  const readings = await reg.allHealth().catch(() => [])
  const byRpc = new Map<string, typeof readings>()
  for (const h of readings) {
    const id = `${h.chainId}|${h.url}`
    byRpc.set(id, [...(byRpc.get(id) ?? []), h])
  }
  for (const c of chains) {
    for (const r of c.rpcs) {
      const mine = byRpc.get(`${c.id}|${r.url}`)
      if (mine) r.readings = mine.map((h) => ({ ...h, blockNumber: String(h.blockNumber) }))
    }
  }
  set({ chains: [...chains], rollup: rollupOf(chains) })
}

export async function boot() {
  try {
    const response = await fetch("snapshot.json")
    if (!response.ok) throw new Error(String(response.status))
    const snap = (await response.json()) as Snapshot
    const chains = fromSnapshot(snap)
    set({ ready: true, chains, byId: index(chains), source: "cached", snapshotAt: snap.builtAt, survey: snap.survey, healthFrom: snap.survey ? "survey" : "none", rollup: rollupOf(chains) })
    void loadLive(chains.length)
  } catch {
    set({ ready: true, failed: true })
    void loadLive(0)
  }
}
