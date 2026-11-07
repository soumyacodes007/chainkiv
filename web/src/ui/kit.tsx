// gr8r's components as React, from the OpenTrigger dashboard: the markup and class names are gr8r's own, so its CSS applies as is.
import { Children, cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ARKIV_EXPLORER, short } from "../lib/format"
import { I } from "./icons"

/** Re-renders every `ms`, for "2 min ago". */
export function useNow(every = 1000) {
  const [, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), every)
    return () => clearInterval(t)
  }, [every])
  return Date.now()
}

export const cx = (...c: unknown[]) => c.filter(Boolean).join(" ")

// ---- toasts ---------------------------------------------------------------------------------------

type Toast = { id: string; msg: string; kind?: "err" | "info"; ms?: number; out?: boolean }
let toasts: Toast[] = []
const tsubs = new Set<() => void>()
const emit = () => tsubs.forEach((f) => f())
export function toast(msg: string, opt: Partial<Toast> = {}) {
  const id = Math.random().toString(36).slice(2)
  toasts = [...toasts, { id, msg, ...opt }]
  emit()
  setTimeout(() => dismiss(id), opt.ms || 4600)
}
function dismiss(id: string) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, out: true } : t))
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 160)
}
export function ToastHost() {
  const list = useSyncExternalStore(
    (f) => (tsubs.add(f), () => tsubs.delete(f)),
    () => toasts,
  )
  const host = document.getElementById("toasts")
  if (!host) return null
  return createPortal(
    list.map((t) => (
      <div key={t.id} className={cx("toast", t.out && "out")} role="status">
        <I n={t.kind === "err" ? "circle-alert" : t.kind === "info" ? "info" : "circle-check"} s={15} className={t.kind === "err" ? "bad" : t.kind === "info" ? "" : "ok"} />
        <span className="grow">{t.msg}</span>
        <button className="ibtn ibtn-xs" aria-label="Dismiss" style={{ color: "inherit", opacity: 0.6 }} onClick={() => dismiss(t.id)}>
          <I n="x" s={13} />
        </button>
      </div>
    )),
    host,
  )
}

// ---- modal ----------------------------------------------------------------------------------------

export const focusable = (root: Element) => [...root.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input,textarea,[tabindex='0']")]

export function Modal({ title, sub, onClose, children, footer, size }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "xl" }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const shell = document.querySelector(".shell")
    shell?.setAttribute("inert", "")
    box.current?.querySelector<HTMLElement>("button")?.focus()
    return () => {
      shell?.removeAttribute("inert")
      before?.focus?.()
    }
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose()
      if (e.key !== "Tab" || !box.current) return
      const items = focusable(box.current)
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last?.focus())
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first?.focus())
    }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [onClose])
  return createPortal(
    <>
      <div className="scrim enter" onClick={onClose} />
      <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={box} className={cx("modal enter", size)} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-h">
            <div>
              <h2 id="modal-title">{title}</h2>
              {sub && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {sub}
                </div>
              )}
            </div>
            <button className="ibtn ibtn-sm" onClick={onClose} aria-label="Close">
              <I n="x" s={16} />
            </button>
          </div>
          <div className="modal-b">{children}</div>
          {footer && <div className="modal-f">{footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  )
}

// ---- floating menu ----------------------------------------------------------------------------------

export function Menu({ trigger, children, width = 220, align = "left", className = "", role = "menu" }: { trigger: (p: any) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); width?: number; align?: "left" | "right"; className?: string; role?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const btn = useRef<HTMLElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>("[role=menuitem],[role=option]")?.focus()
    else if (wasOpen.current) btn.current?.focus()
    wasOpen.current = open
  }, [open])
  const onKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(pop.current?.querySelectorAll<HTMLElement>("[role=menuitem],[role=option]") ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const to = e.key === "ArrowDown" ? (at + 1) % items.length : e.key === "ArrowUp" ? (at - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1
    if (to >= 0) (e.preventDefault(), items[to]?.focus())
    if (e.key === "Tab") (e.preventDefault(), close())
  }
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const h = pop.current?.offsetHeight || 0
    let x = align === "right" ? r.right - width : r.left
    x = Math.max(8, Math.min(x, innerWidth - width - 8))
    const y = r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4
    setPos({ x, y })
  }, [open, width, align])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close()
    const key = (e: KeyboardEvent) => e.key === "Escape" && close()
    addEventListener("mousedown", down, true)
    addEventListener("keydown", key)
    addEventListener("resize", close)
    return () => {
      removeEventListener("mousedown", down, true)
      removeEventListener("keydown", key)
      removeEventListener("resize", close)
    }
  }, [open])
  return (
    <>
      {trigger({ ref: btn, onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open &&
        createPortal(
          <div ref={pop} className={cx("pop floating enter", className)} role={role} onKeyDown={onKeys} style={{ left: pos?.x ?? -999, top: pos?.y ?? -999, width, maxWidth: width }} onClick={(e) => (e.target as HTMLElement).closest("[data-close]") && close()}>
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  )
}

export const MenuItem = ({ icon, children, onClick, href, checked }: { icon?: string; children: ReactNode; onClick?: () => void; href?: string; checked?: boolean }) => {
  const inner = (
    <>
      {icon && <I n={icon} s={15} />}
      <span className="trunc grow">{children}</span>
      {checked && (
        <span className="ck">
          <I n="check" s={14} />
        </span>
      )}
    </>
  )
  return href ? (
    <a className="mi" href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noreferrer" data-close role="menuitem">
      {inner}
    </a>
  ) : (
    <button className="mi" onClick={onClick} data-close role="menuitem">
      {inner}
    </button>
  )
}

export function Select({ value, onChange, options, style, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; hint?: string }[]; style?: CSSProperties; ariaLabel?: string }) {
  const cur = options.find((o) => o.value === value) ?? options[0]
  return (
    <Menu
      width={230}
      className="select-menu"
      role="listbox"
      trigger={(p) => (
        <button type="button" className="select select-btn" style={style} aria-label={ariaLabel ? `${ariaLabel}: ${cur?.label}` : undefined} {...p}>
          <span className="trunc">{cur?.label}</span>
        </button>
      )}
    >
      {options.map((o) => (
        <button type="button" key={o.value} className="mi" role="option" aria-selected={o.value === value} data-close onClick={() => onChange(o.value)}>
          <span className="trunc grow">{o.label}</span>
          {o.hint && <span className="r faint">{o.hint}</span>}
          {o.value === value && (
            <span className="ck">
              <I n="check" s={14} />
            </span>
          )}
        </button>
      ))}
    </Menu>
  )
}

// ---- small pieces -----------------------------------------------------------------------------------

export function Seg({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, ReactNode, ReactNode?, string?][]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, n, extra, name]) => (
        <button key={k} type="button" aria-pressed={value === k} aria-label={name} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {n}
          {extra != null && extra !== "" && <span className="faint">{extra}</span>}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, sub, acts, children, body = true, className = "", style }: { title?: ReactNode; sub?: ReactNode; acts?: ReactNode; children: ReactNode; body?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <section className={cx("panel", className)} style={style}>
      {(title || acts) && (
        <div className="panel-h">
          {title && (
            <div className="grow" style={{ minWidth: 0 }}>
              <h2>{title}</h2>
              {sub && <p className="panel-sub">{sub}</p>}
            </div>
          )}
          {acts && <div className="acts">{acts}</div>}
        </div>
      )}
      {body ? <div className="panel-b">{children}</div> : children}
    </section>
  )
}

export function Empty({ icon, title, text, children, sm }: { icon: string; title: string; text?: ReactNode; children?: ReactNode; sm?: boolean }) {
  return (
    <div className={cx("empty-state", sm && "sm")}>
      <div className="glyph">
        <I n={icon} s={20} />
      </div>
      <h2 className="es-h">{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  )
}

export function copy(text: string, what = "Copied") {
  navigator.clipboard?.writeText(text).then(
    () => toast(`${what} to the clipboard`),
    () => toast("Copying is blocked in this browser", { kind: "err" }),
  )
}

/** An address or hash in mono, with copy and an optional link. */
export function Addr({ a, n = 4, url }: { a?: string; n?: number; url?: string }) {
  if (!a) return <span className="faint">—</span>
  return (
    <span className="addr" title={a}>
      <span className="mono">{short(a, n)}</span>
      <button className="ibtn ibtn-xs" onClick={(e) => (e.stopPropagation(), copy(a))} aria-label="Copy" data-tip="Copy">
        <I n="copy" s={12} />
      </button>
      {(url || (a.length === 42 && a.startsWith("0x"))) && (
        <a className="ibtn ibtn-xs" href={url ?? `${ARKIV_EXPLORER}/address/${a}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Open" data-tip="Open">
          <I n="arrow-up-right" s={12} />
        </a>
      )}
    </span>
  )
}

export function Blob({ a, size = 22 }: { a: string; size?: number }) {
  const h = parseInt(a.slice(2, 8), 16) % 360
  return <span className="blob" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 60) % 360} 58% 46%))` }} aria-hidden="true" />
}

export function Field({ label, hint, err, children }: { label?: string; hint?: ReactNode; err?: ReactNode; children: ReactNode }) {
  const id = useId()
  const note = `${id}-note`
  const control = cloneElement(Children.only(children) as ReactElement<{ id?: string; "aria-describedby"?: string }>, { id, "aria-describedby": err || hint ? note : undefined })
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      {control}
      {err ? (
        <span className="err" id={note}>
          <I n="circle-alert" s={12} />
          {err}
        </span>
      ) : hint ? (
        <span className="hint" id={note}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export function Code({ children }: { children: string }) {
  return (
    <div className="codeblock">
      <button className="ibtn ibtn-xs cb-copy" onClick={() => copy(children)} aria-label="Copy" data-tip="Copy">
        <I n="copy" s={13} />
      </button>
      <pre tabIndex={0} aria-label="Code">
        {children}
      </pre>
    </div>
  )
}
