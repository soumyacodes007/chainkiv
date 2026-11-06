// The gr8r shell: sidebar, top bar and mobile bottom bar, with Chainroll's navigation.
import { useEffect, type MouseEvent, type ReactNode } from "react"
import { ago, fmt, short, UPSTREAM } from "../lib/format"
import { getState, setPrefs, setUi, setWallet, useStore } from "../lib/store"
import { go, href, useRoute } from "../lib/router"
import { Glyph } from "../ui/chain"
import { I } from "../ui/icons"
import { Blob, Menu, MenuItem, copy, cx } from "../ui/kit"

export const ROUTES: Record<string, [string, string, string]> = {
  overview: ["Overview", "layout-dashboard", ""],
  chains: ["Networks", "globe", "chains"],
  health: ["RPC health", "activity", "health"],
  releases: ["Releases", "scroll-text", "releases"],
  proposals: ["Proposals", "send", "proposals"],
  about: ["How it works", "compass", "about"],
}
const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"

function SItem({ to, label, icon, ct, on, collapsed }: { to: string; label: string; icon: string; ct?: ReactNode; on?: boolean; collapsed?: boolean }) {
  return (
    <a className={cx("sitem", on && "on")} href={href(to)} aria-current={on ? "page" : undefined} data-tip={collapsed ? label : undefined} data-tip-pos="right" onClick={() => setUi({ mnav: false })}>
      <I n={icon} s={16} />
      <span className="trunc">{label}</span>
      {ct ? <span className="ct">{ct}</span> : null}
    </a>
  )
}

export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="ckmark">
    <rect width="32" height="32" rx="8" fill="var(--text)" />
    <path d="M16 6.5 24.2 11.2v9.6L16 25.5l-8.2-4.7v-9.6z" fill="none" stroke="var(--bg)" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="m12.2 16 2.7 2.7 5-5.2" fill="none" stroke="var(--acc-d)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Sidebar() {
  const route = useRoute()
  const { chains, byId, prefs, rollup, ui, wallet } = useStore()
  const r = route.name
  const pins = prefs.pins.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
  return (
    <nav className="side" aria-label="Main">
      <div className="side-top">
        <div className="row" style={{ gap: 2 }}>
          <a className="ws grow" href={href("")}>
            <Mark />
            <span className="ws-name trunc">Chainroll</span>
          </a>
          {!ui.collapsed && (
            <button className="ibtn ibtn-sm hide-m" onClick={() => setUi({ collapsed: true })} data-tip="Collapse sidebar" aria-label="Collapse sidebar">
              <I n="panel-left" s={15} />
            </button>
          )}
        </div>
      </div>
      <div className="side-scroll">
        {ui.collapsed && (
          <button className="sitem" onClick={() => setUi({ collapsed: false })} data-tip="Expand sidebar" data-tip-pos="right" aria-label="Expand sidebar">
            <I n="panel-left" s={16} />
          </button>
        )}
        <SItem to="" label="Overview" icon="layout-dashboard" on={r === "overview"} collapsed={ui.collapsed} />
        <SItem to="chains" label="Networks" icon="globe" on={r === "chains" || r === "chain" || r === "verify" || r === "rpc"} ct={chains.length ? fmt(chains.length) : ""} collapsed={ui.collapsed} />
        <SItem to="health" label="RPC health" icon="activity" on={r === "health"} ct={rollup && rollup.green ? fmt(rollup.green) : ""} collapsed={ui.collapsed} />
        <SItem to="releases" label="Releases" icon="scroll-text" on={r === "releases"} collapsed={ui.collapsed} />
        <SItem to="proposals" label="Proposals" icon="send" on={r === "proposals" || r === "submit"} collapsed={ui.collapsed} />
        {pins.length > 0 && (
          <div className="sgroup">
            <div className="sgroup-h">
              <span>Pinned</span>
            </div>
            {pins.map((c) => (
              <a key={c.id} className={cx("sitem", route.params.id === c.id && "on")} href={href(`chain/${c.id}`)} data-tip={ui.collapsed ? c.name : undefined} data-tip-pos="right" onClick={() => setUi({ mnav: false })}>
                <Glyph chain={c} size={18} />
                <span className="trunc">{c.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="side-bot">
        <SItem to="about" label="How it works" icon="compass" on={r === "about"} collapsed={ui.collapsed} />
        <a className="sitem" href={UPSTREAM} target="_blank" rel="noreferrer" data-tip={ui.collapsed ? "Upstream list" : undefined} data-tip-pos="right">
          <I n="github" s={16} />
          <span>Upstream list</span>
          <span className="ct">
            <I n="arrow-up-right" s={12} />
          </span>
        </a>
        {wallet ? (
          <div className="sitem" style={{ height: 36 }}>
            <Blob a={wallet.address} size={20} />
            <span className="trunc mono" style={{ color: "var(--text)", fontSize: 12 }}>
              {short(wallet.address)}
            </span>
          </div>
        ) : (
          <button className="sitem" onClick={() => setUi({ modal: "connect", mnav: false })} style={{ height: 36 }}>
            <I n="wallet" s={16} />
            <span>Connect wallet</span>
          </button>
        )}
      </div>
    </nav>
  )
}

function crumbs(name: string, params: Record<string, string>, nameOf: (id: string) => string): [string, string?][] {
  if (name === "chain") return [["Networks", "chains"], [nameOf(params.id!)]]
  if (name === "verify") return [["Networks", "chains"], [nameOf(params.id!), `chain/${params.id}`], ["Verify"]]
  if (name === "rpc") return [["Networks", "chains"], [nameOf(params.chainId!), `chain/${params.chainId}`], ["RPC"]]
  if (name === "submit") return [["Proposals", "proposals"], ["New proposal"]]
  return [[ROUTES[name]?.[0] ?? "Not found"]]
}

/** Always says where the numbers on screen came from. */
function SourcePill() {
  const { source, arkiv, snapshotAt, healthFrom } = useStore()
  const age = snapshotAt ? ago(Date.parse(snapshotAt) / 1000) : ""
  const map: Record<string, [string, string, string, boolean]> = {
    live: ["Live on Arkiv", "var(--green)", healthFrom === "probers" ? "List matches the signed release on Arkiv, health from signed readings" : "Chains and RPCs read from Arkiv. Health is from the last survey", true],
    checking: ["Reading Arkiv", "var(--amber)", "Looking for the publisher's records", false],
    importing: [arkiv.found ? `Import ${fmt(arkiv.found)} so far` : "Import running", "var(--amber)", `The publisher's records are still being written. Showing the cached copy from ${age}`, false],
    "no-publisher": ["Cached copy", "var(--text-4)", `No publisher configured yet. Copy from ${age}`, false],
    limited: ["Rate limited", "var(--amber)", `Arkiv is limiting this browser. Showing the cached copy from ${age}`, false],
    down: ["Arkiv unreachable", "var(--red)", `Showing the cached copy from ${age}`, false],
    unconfirmed: ["Publisher unconfirmed", "var(--red)", `Showing the cached copy from ${age}`, false],
  }
  const [text, c, tip, live] = map[source === "arkiv" ? "live" : arkiv.state]!
  return (
    <span className={cx("pill-ind src", live && "live")} style={{ "--c": c } as object} data-tip={tip} tabIndex={0} aria-label={`${text}. ${tip}`}>
      <i />
      {text}
    </span>
  )
}

function ThemeMenu() {
  const theme = useStore((s) => s.prefs.theme)
  return (
    <Menu
      width={170}
      align="right"
      trigger={(p) => (
        <button className="ibtn hide-m" {...p} aria-label="Theme">
          <I n={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} s={15} />
        </button>
      )}
    >
      <MenuItem icon="sun" checked={theme === "light"} onClick={() => setPrefs({ theme: "light" })}>
        Light
      </MenuItem>
      <MenuItem icon="moon" checked={theme === "dark"} onClick={() => setPrefs({ theme: "dark" })}>
        Dark
      </MenuItem>
      <MenuItem icon="monitor" checked={theme === "system"} onClick={() => setPrefs({ theme: "system" })}>
        System
      </MenuItem>
    </Menu>
  )
}

function Topbar() {
  const route = useRoute()
  const { byId, wallet } = useStore()
  const cs = crumbs(route.name, route.params, (id) => byId.get(id)?.name ?? `Chain ${id}`)
  return (
    <header className="topbar">
      <button className="ibtn mnav-btn" onClick={() => setUi({ mnav: true })} aria-label="Open navigation">
        <I n="menu" s={17} />
      </button>
      <nav className="crumbs trunc" aria-label="Breadcrumb">
        {cs.flatMap(([label, to], i) => [
          i > 0 && (
            <span key={"s" + i} className="sep" aria-hidden="true">
              /
            </span>
          ),
          to && i < cs.length - 1 ? (
            <button key={i} onClick={() => go(to)}>
              {label}
            </button>
          ) : (
            <span key={i} className="cur" aria-current="page">
              {label}
            </span>
          ),
        ])}
      </nav>
      <span className="sp" />
      <SourcePill />
      <button className="topsearch" onClick={() => setUi({ palette: true })} aria-keyshortcuts="Control+K">
        <I n="search" s={14} />
        <span className="lbltxt">Find a network…</span>
        <span className="kbd">{MOD}K</span>
      </button>
      <ThemeMenu />
      <button className="btn btn-primary btn-sm" onClick={() => go("proposals/new")} aria-label="Propose">
        <I n="plus" s={14} />
        <span className="hide-m">Propose</span>
      </button>
      {wallet && (
        <Menu
          width={230}
          align="right"
          trigger={(p) => (
            <button className="ibtn" {...p} aria-label="Account menu" style={{ width: "auto", padding: "0 2px" }}>
              <Blob a={wallet.address} size={24} />
            </button>
          )}
        >
          <div className="mh" style={{ textTransform: "none", letterSpacing: 0 }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>
              {short(wallet.address, 6)}
            </div>
            <div className="faint" style={{ fontWeight: 400, marginTop: 2 }}>
              {wallet.name}
            </div>
          </div>
          <MenuItem icon="copy" onClick={() => copy(wallet.address, "Address copied")}>
            Copy address
          </MenuItem>
          <div className="msep" />
          <MenuItem icon="log-out" onClick={() => setWallet(null)}>
            Disconnect
          </MenuItem>
        </Menu>
      )}
    </header>
  )
}

function BottomNav() {
  const r = useRoute().name
  const b = (to: string, name: string, label: string, icon: string) => (
    <button className={r === name ? "on" : ""} aria-current={r === name ? "page" : undefined} onClick={() => go(to)}>
      <I n={icon} s={19} />
      <span>{label}</span>
    </button>
  )
  return (
    <nav className="bottomnav" aria-label="Primary">
      {b("", "overview", "Overview", "layout-dashboard")}
      {b("chains", "chains", "Networks", "globe")}
      {b("health", "health", "Health", "activity")}
      {b("proposals", "proposals", "Proposals", "send")}
      <button onClick={() => setUi({ mnav: true })}>
        <I n="ellipsis" s={19} />
        <span>More</span>
      </button>
    </nav>
  )
}

const skip = (e: MouseEvent) => {
  e.preventDefault()
  document.getElementById("main-content")?.focus()
}

export function Shell({ children }: { children: ReactNode }) {
  const ui = useStore((s) => s.ui)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && getState().ui.mnav && setUi({ mnav: false })
    addEventListener("keydown", esc)
    return () => removeEventListener("keydown", esc)
  }, [])
  const route = useRoute()
  const name = useStore((s) => s.byId.get(route.params.id ?? route.params.chainId ?? "")?.name)
  useEffect(() => {
    document.title = `${name ?? ROUTES[route.name]?.[0] ?? "Chainroll"} · Chainroll`
  }, [name, route.name])
  const { arkiv, source, snapshotAt } = useStore()
  return (
    <div className={cx("shell", ui.collapsed && "collapsed", ui.mnav && "mnav")}>
      <a className="skip" href="#main-content" onClick={skip}>
        Skip to content
      </a>
      <Sidebar />
      {ui.mnav && <div className="side-scrim" onClick={() => setUi({ mnav: false })} />}
      <main className="main" id="main">
        <Topbar />
        {source !== "arkiv" && (arkiv.state === "down" || arkiv.state === "limited" || arkiv.state === "unconfirmed") && (
          <div className="offline-bar" role="status">
            <I n="wifi-off" s={15} />
            <span>
              <b>{arkiv.state === "unconfirmed" ? "The publisher couldn't be confirmed on Ethereum." : arkiv.state === "limited" ? "Arkiv is limiting reads from this browser." : "Arkiv can't be reached right now."}</b> You're seeing the cached copy{snapshotAt ? ` from ${ago(Date.parse(snapshotAt) / 1000)}` : ""}.
            </span>
          </div>
        )}
        <div className="content" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
