// ⌘K: find any network by name, short name, ID or currency, jump to a page, or switch theme.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { searchChains } from "../lib/search"
import { setPrefs, setUi, useStore } from "../lib/store"
import { go } from "../lib/router"
import { Glyph } from "../ui/chain"
import { I } from "../ui/icons"
import { cx } from "../ui/kit"
import { ROUTES } from "./Shell"

type Item = { icon?: string; chain?: any; name: string; sub?: string; run: () => void }

export function Palette() {
  const chains = useStore((s) => s.chains)
  const [q, setQ] = useState("")
  const [hl, setHl] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const close = () => setUi({ palette: false })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    input.current?.focus()
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setUi({ palette: false })
    addEventListener("keydown", esc)
    return () => {
      removeEventListener("keydown", esc)
      before?.focus?.()
    }
  }, [])
  useEffect(() => document.getElementById(`pal-${hl}`)?.scrollIntoView({ block: "nearest" }), [hl])

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    const m = (s: string) => !t || s.toLowerCase().includes(t)
    const out: { name: string; items: Item[] }[] = []
    if (t) out.push({ name: "Networks", items: searchChains(chains, t).slice(0, 8).map((c) => ({ chain: c, name: c.name, sub: `${c.id} · ${c.short} · ${c.symbol}`, run: () => go(`chain/${c.id}`) })) })
    out.push({ name: "Go to", items: Object.values(ROUTES).map(([n, icon, to]) => ({ icon, name: n, run: () => go(to) })).filter((x) => m(x.name)) })
    out.push({
      name: "Theme",
      items: (
        [
          ["light", "Light theme", "sun"],
          ["dark", "Dark theme", "moon"],
          ["system", "System theme", "monitor"],
        ] as const
      )
        .map(([v, n, icon]) => ({ icon, name: n, run: () => setPrefs({ theme: v }) }))
        .filter((x) => m(x.name)),
    })
    return out.filter((g) => g.items.length)
  }, [q, chains])

  const flat = groups.flatMap((g) => g.items)
  const run = (it?: Item) => {
    close()
    it?.run()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHl((h) => Math.min(flat.length - 1, h + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHl((h) => Math.max(0, h - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      run(flat[hl])
    } else if (e.key === "Tab") e.preventDefault()
  }
  let idx = 0
  return createPortal(
    <>
      <div className="scrim" onClick={close} style={{ zIndex: 89 }} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Find a network">
        <div className="pal-in">
          <I n="search" s={17} />
          <input ref={input} value={q} onChange={(e) => (setQ(e.target.value), setHl(0))} onKeyDown={onKey} placeholder="Base, arb, 8453, or a currency like POL…" autoComplete="off" role="combobox" aria-label="Find a network" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat.length ? `pal-${hl}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox">
          {flat.length ? (
            groups.map((g) => (
              <div className="pal-group" key={g.name}>
                <div className="pal-sec">{g.name}</div>
                {g.items.map((it) => {
                  const i = idx++
                  return (
                    <div key={i} id={`pal-${i}`} className={cx("pi", i === hl && "hl")} role="option" aria-selected={i === hl} onMouseEnter={() => setHl(i)} onClick={() => run(it)}>
                      {it.chain ? <Glyph chain={it.chain} size={18} /> : <I n={it.icon!} s={15} />}
                      <span className="trunc">{it.name}</span>
                      {it.sub && <span className="sub trunc">{it.sub}</span>}
                    </div>
                  )
                })}
              </div>
            ))
          ) : (
            <div className="empty-state sm">
              <div className="glyph">
                <I n="search" s={18} />
              </div>
              <h2 className="es-h">No network by that name</h2>
              <p>Try a chain ID or short name.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => run({ name: "", run: () => go("proposals/new") })}>
                Propose this chain
              </button>
            </div>
          )}
        </div>
        <div className="pal-f">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>navigate
          </span>
          <span>
            <kbd>↵</kbd>open
          </span>
          <span className="sp" style={{ flex: 1 }} />
          <span className="faint">ChainKiv</span>
        </div>
      </div>
    </>,
    document.body,
  )
}
