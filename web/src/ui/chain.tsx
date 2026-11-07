// The pieces that say what a chain is: its glyph, trust badge, health dot and card.
import { href } from "../lib/router"
import { assess, toneVar, type Assessment } from "../lib/health"
import { useStore } from "../lib/store"
import type { ChainRow } from "../lib/types"
import { AddWallet } from "./addWallet"
import { Dots, hover, TipRow } from "./charts"
import { I } from "./icons"
import { cx } from "./kit"

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const monogram = (name: string) => {
  const words = name.replace(/\b(mainnet|testnet|network|chain|the|sepolia)\b/gi, "").trim().split(/[\s-]+/).filter(Boolean)
  const first = words[0] ?? name
  return (words.length > 1 ? first[0]! + words[1]![0]! : first.slice(0, 2)).toUpperCase()
}

/** Each chain gets its own generated mark, so a page of chains reads as faces, not a spreadsheet. */
export function Glyph({ chain, size = 36 }: { chain: Pick<ChainRow, "id" | "name" | "testnet">; size?: number }) {
  const h = hash(chain.id)
  const hue = h % 360
  const rot = (h >> 9) % 60
  const id = `g${chain.id}`
  const text = monogram(chain.name)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="glyphm" role="img" aria-label={chain.name}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 62% ${chain.testnet ? 66 : 56}%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 46) % 360} 58% ${chain.testnet ? 54 : 40}%)`} />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="40" height="40" fill={`url(#${id})`} />
        <g transform={`rotate(${rot} 20 20)`} fill="none" stroke="#fff" strokeOpacity=".16">
          <path d="M20 -2 39 9v22L20 42 1 31V9z" />
          <path d="M20 8 30 14v12L20 32 10 26V14z" />
        </g>
      </g>
      <text x="20" y="25.5" textAnchor="middle" fontSize={text.length > 1 ? 15 : 18} fontWeight="600" fill="#fff" fontFamily="var(--font)" letterSpacing="-.3">
        {text}
      </text>
      {chain.testnet && <circle cx="33" cy="33" r="3.5" fill="#fff" fillOpacity=".9" />}
    </svg>
  )
}

export function TrustBadge({ state }: { state?: string }) {
  const source = useStore((s) => s.source)
  const known: Record<string, [string, string, string, string]> = {
    checking: ["gray", "loader", "Checking…", "Running the checks in this browser"],
    verified: ["green", "badge-check", "Verified", "All seven checks pass on the latest anchored release"],
    pending: ["amber", "hourglass", "Pending anchor", "Newer than the latest release signed on Ethereum"],
    failed: ["red", "shield-alert", "Unverified", "Not publisher-owned, or a check failed"],
    incomplete: ["gray", "circle-dashed", "Not checked", "Some checks could not run, so this is not a pass"],
  }
  const [c, icon, label, tip] = known[state ?? ""] ?? (source === "arkiv" ? known.incomplete! : (["gray", "circle-dashed", "Not checked", "Cached copy. Open Verify to check it against Ethereum"] as [string, string, string, string]))
  return (
    <span className={cx("badge", c)} data-tip={tip}>
      <I n={icon} s={12} />
      {label}
    </span>
  )
}

export function HealthPill({ a }: { a: Assessment }) {
  return (
    <span className="hpill" style={{ "--c": toneVar(a.tone) } as object} {...hover(<TipRow value={a.label} label={a.detail} color={toneVar(a.tone)} />)}>
      <i />
      {a.label}
    </span>
  )
}

export const LayerTag = ({ c }: { c: ChainRow }) => (
  <span className="tag">
    {c.id === "1" ? "Base layer" : c.layer === "L1" ? "Layer not stated" : c.layer === "L2" ? "Layer 2" : c.layer === "shard" ? "Shard" : c.layer}
    {c.testnet ? " · Testnet" : ""}
  </span>
)

/** The card on Overview and Chains: who it is, is it trusted, and how many RPCs work. */
export function ChainCard({ c }: { c: ChainRow }) {
  const healthFrom = useStore((s) => s.healthFrom)
  const tones = c.rpcs.map((r) => assess(r))
  const passing = tones.filter((t) => t.tone === "green").length
  const best = Math.min(...tones.filter((t) => t.tone === "green" && t.latency).map((t) => t.latency!))
  return (
    <div className="ccd">
      <a className="ccd-l" href={href(`chain/${c.id}`)}>
        <div className="ccd-h">
          <Glyph chain={c} size={38} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="ccd-n trunc">{c.name}</div>
            <div className="ccd-s trunc">
              <span className="num">{c.id}</span> · {c.symbol || "no token"}
            </div>
          </div>
          {c.reused && <I n="triangle-alert" s={15} style={{ color: "var(--amber)" }} />}
        </div>
        <div className="ccd-f">
          <Dots tones={tones.map((t) => toneVar(t.tone))} max={14} />
          <span className="sp" />
          <span className="ccd-m">{!c.rpcs.length ? "No RPCs listed" : healthFrom === "none" ? `${c.rpcs.length} RPC${c.rpcs.length > 1 ? "s" : ""}` : `${passing} of ${c.rpcs.length} pass${isFinite(best) ? ` · ${Math.round(best)} ms` : ""}`}</span>
        </div>
      </a>
      <AddWallet c={c} />
    </div>
  )
}
