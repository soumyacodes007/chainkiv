// Hand-built SVG and canvas charts. Thin marks, hairline axes, one tooltip, and every value reachable without hovering.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { fmt, pct } from "../lib/format"
import { useStore } from "../lib/store"
import { cx } from "./kit"

// ---- the one tooltip --------------------------------------------------------------------------------

let tip: { x: number; y: number; body: ReactNode } | null = null
const subs = new Set<() => void>()
const setTip = (t: typeof tip) => {
  tip = t
  subs.forEach((f) => f())
}
export const hover = (body: ReactNode) => ({
  onPointerMove: (e: { clientX: number; clientY: number }) => setTip({ x: e.clientX, y: e.clientY, body }),
  onPointerLeave: () => setTip(null),
  onFocus: (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, body })
  },
  onBlur: () => setTip(null),
})
export function ChartTip() {
  const t = useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => tip,
  )
  if (!t) return null
  const left = Math.min(t.x + 14, innerWidth - 260)
  return createPortal(
    <div className="ctip" style={{ left: Math.max(8, left), top: Math.max(8, t.y - 12) }}>
      {t.body}
    </div>,
    document.body,
  )
}
export const TipRow = ({ value, label, color }: { value: ReactNode; label: ReactNode; color?: string }) => (
  <div className="ctip-r">
    {color && <i style={{ background: color }} />}
    <b>{value}</b>
    <span>{label}</span>
  </div>
)

// ---- segmented bar: one whole, split into parts ---------------------------------------------------------

export type Part = { key: string; label: string; value: number; color: string }

export function SegBar({ parts, tall }: { parts: Part[]; tall?: boolean }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  return (
    <div className="segwrap">
      <div className={cx("segbar", tall && "tall")} role="img" aria-label={parts.map((p) => `${p.label} ${fmt(p.value)}, ${pct(p.value, total, 1)}`).join("; ")}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const share = p.value / total
            return (
              <span key={p.key} className="sg" style={{ flexGrow: p.value, flexBasis: 0, background: p.color }} {...hover(<TipRow value={`${fmt(p.value)} · ${pct(p.value, total, 1)}`} label={p.label} color={p.color} />)}>
                {tall && share > 0.1 && <em>{pct(p.value, total)}</em>}
              </span>
            )
          })}
      </div>
    </div>
  )
}

export function Legend({ parts, total }: { parts: Part[]; total?: number }) {
  const all = total ?? parts.reduce((a, p) => a + p.value, 0)
  return (
    <ul className="legend">
      {parts.map((p) => (
        <li key={p.key}>
          <i style={{ background: p.color }} />
          <span className="trunc">{p.label}</span>
          <b>{fmt(p.value)}</b>
          <em>{pct(p.value, all)}</em>
        </li>
      ))}
    </ul>
  )
}

// ---- ranked horizontal bars ------------------------------------------------------------------------------

export function RankBars({ rows, color = "var(--accent)", unit = "" }: { rows: { key: string; label: ReactNode; value: number; href?: string; color?: string }[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="rank">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="rl trunc">{r.label}</span>
            <span className="rt">
              <i style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: r.color ?? color }} />
            </span>
            <b>
              {fmt(r.value)}
              {unit}
            </b>
          </>
        )
        return r.href ? (
          <a key={r.key} className="rr" href={r.href}>
            {inner}
          </a>
        ) : (
          <div key={r.key} className="rr">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

// ---- histogram -------------------------------------------------------------------------------------------

function useWidth<T extends HTMLElement>() {
  const box = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [box, width] as const
}

export function Histogram({ bins, color = "var(--accent)", height = 150 }: { bins: { label: string; value: number }[]; color?: string; height?: number }) {
  const [box, W] = useWidth<HTMLDivElement>()
  const H = height
  const axis = 22
  const top = 18
  const max = Math.max(1, ...bins.map((b) => b.value))
  const band = W / bins.length
  const bar = Math.min(24, band - 2)
  return (
    <div ref={box} className="hist">
      {W > 0 && (
        <svg width={W} height={H + axis} role="img" aria-label={bins.map((b) => `${b.label}: ${b.value}`).join(", ")}>
          <line x1="0" x2={W} y1={H} y2={H} className="axisl" />
          {bins.map((b, i) => {
            const h = (b.value / max) * (H - top)
            const x = i * band + (band - bar) / 2
            const r = Math.min(4, h)
            return (
              <g key={b.label} {...hover(<TipRow value={fmt(b.value)} label={`RPCs up to ${b.label}`} color={color} />)}>
                <rect x={i * band} y={0} width={band} height={H} fill="transparent" />
                {h > 0 && <path d={`M${x},${H}v${-h + r}q0,${-r} ${r},${-r}h${bar - 2 * r}q${r},0 ${r},${r}v${h - r}z`} fill={color} />}
                {band >= 30 && (
                  <text x={i * band + band / 2} y={H - h - 5} textAnchor="middle" className="axt">
                    {fmt(b.value)}
                  </text>
                )}
                {(band >= 30 || i % 2 === 0 || i === bins.length - 1) && (
                  <text x={i * band + band / 2} y={H + 15} textAnchor="middle" className="axt">
                    {b.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// ---- ring gauge ---------------------------------------------------------------------------------------------

export function Ring({ value, label, sub, size = 118, tone = "var(--green)" }: { value: number | null; label: string; sub?: ReactNode; size?: number; tone?: string }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const known = value !== null
  return (
    <div className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${known ? `${value}%` : "no data yet"}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-t" strokeDasharray={known ? undefined : "2 6"} />
        {known && <circle cx={size / 2} cy={size / 2} r={r} className="ring-v" stroke={tone} strokeDasharray={`${(c * value!) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      </svg>
      <div className="ring-c">
        <b>{known ? `${value! % 1 ? value!.toFixed(1) : value}%` : "—"}</b>
        <span>{label}</span>
      </div>
      {sub && <div className="ring-s">{sub}</div>}
    </div>
  )
}

// ---- health dots: one per RPC --------------------------------------------------------------------------------

export const Dots = ({ tones, max = 16 }: { tones: string[]; max?: number }) => (
  <span className="dots" aria-hidden="true">
    {tones.slice(0, max).map((t, i) => (
      <i key={i} style={{ background: t }} />
    ))}
    {tones.length > max && <em>+{tones.length - max}</em>}
  </span>
)

// ---- waffle: every RPC as one square, on canvas because there are thousands --------------------------------------

export type Cell = { color: string; label: string; sub: string; to: string }

export function Waffle({ cells, cell = 9, gap = 2 }: { cells: Cell[]; cell?: number; gap?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, measured] = useWidth<HTMLDivElement>()
  const width = measured || 800
  const theme = useStore((s) => s.prefs.theme)
  const [system, setSystem] = useState(0)
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const change = () => setSystem((n) => n + 1)
    media.addEventListener("change", change)
    return () => media.removeEventListener("change", change)
  }, [])
  if (width < 640) {
    cell = 6
    gap = 1
  }
  const step = cell + gap
  const cols = Math.max(1, Math.floor((width + gap) / step))
  const rows = Math.ceil(cells.length / cols)
  const height = rows * step
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = devicePixelRatio || 1
    c.width = width * dpr
    c.height = height * dpr
    const g = c.getContext("2d")!
    g.scale(dpr, dpr)
    const css = getComputedStyle(c)
    const cache = new Map<string, string>()
    const resolve = (v: string) => {
      if (!v.startsWith("var(")) return v
      if (!cache.has(v)) cache.set(v, css.getPropertyValue(v.slice(4, -1)).trim())
      return cache.get(v)!
    }
    cells.forEach((x, i) => {
      g.fillStyle = resolve(x.color)
      g.beginPath()
      g.roundRect((i % cols) * step, Math.floor(i / cols) * step, cell, cell, 2)
      g.fill()
    })
  }, [cells, width, height, cols, step, cell, theme, system])
  const at = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    const col = Math.floor((e.clientX - r.left) / step)
    return col < cols ? cells[Math.floor((e.clientY - r.top) / step) * cols + col] : undefined
  }
  return (
    <div ref={box} className="waffle">
      <canvas
        ref={canvas}
        style={{ width, height }}
        role="img"
        aria-label={`${fmt(cells.length)} squares, one per RPC. The table below has the same counts.`}
        onPointerMove={(e) => {
          const c = at(e)
          setTip(
            c
              ? {
                  x: e.clientX,
                  y: e.clientY,
                  body: (
                    <>
                      <TipRow value={c.label} label="" color={c.color} />
                      <div className="ctip-s">{c.sub}</div>
                    </>
                  ),
                }
              : null,
          )
        }}
        onPointerLeave={() => setTip(null)}
        onClick={(e) => {
          const c = at(e)
          if (c) location.hash = c.to
        }}
      />
    </div>
  )
}
