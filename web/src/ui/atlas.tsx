// The Ethereum atlas: Ethereum at the centre, each real L2 on an orbit, each L3 as a moon of its L2.
// A dot is one network from the registry, so the picture is the data, and every dot is a link.
import { useMemo, useState } from "react"
import { assess } from "../lib/health"
import { href } from "../lib/router"
import type { ChainRow } from "../lib/types"
import { hover, TipRow } from "./charts"

const SIZE = 560
const C = SIZE / 2
const ORBITS = [104, 150, 196, 240]
const CAP = [18, 30, 40, 60]
const LABELS = new Set(["8453", "42161", "10", "324", "59144", "534352", "81457"])
/** Upstream's files for these give no parent, but they settle on Ethereum, and a map of its L2s without them would be wrong. */
export const UNSTATED_L2 = new Set(["8453", "10"])
export const onEthereum = (c: ChainRow) => c.parent === "1" || UNSTATED_L2.has(c.id)

type Dot = { chain: ChainRow; x: number; y: number; r: number; color: string; state: string; moons: Dot[] }

function colorOf(c: ChainRow, healthKnown: boolean) {
  if (!healthKnown || !c.rpcs.length) return { color: "var(--accent)", state: `${c.rpcs.length} RPCs listed` }
  const tones = c.rpcs.map((r) => assess(r).tone)
  const pass = tones.filter((t) => t === "green").length
  const open = tones.filter((t) => t === "teal").length
  if (pass) return { color: "var(--green)", state: `${pass} of ${c.rpcs.length} RPCs pass` }
  if (open) return { color: "var(--teal)", state: `${open} of ${c.rpcs.length} RPCs work, first block unconfirmed` }
  return { color: "var(--red)", state: `None of ${c.rpcs.length} RPCs work` }
}

export function Atlas({ chains, byId, healthKnown }: { chains: ChainRow[]; byId: Map<string, ChainRow>; healthKnown: boolean }) {
  const [hot, setHot] = useState<string | null>(null)
  const dots = useMemo(() => {
    const kids = chains.filter(onEthereum).sort((a, b) => b.rpcs.length - a.rpcs.length)
    const out: Dot[] = []
    let at = 0
    ORBITS.forEach((radius, o) => {
      const ring = kids.slice(at, at + CAP[o]!)
      at += ring.length
      ring.forEach((chain, i) => {
        const angle = ((i + 0.5 * (o % 2)) / ring.length) * Math.PI * 2 - Math.PI / 2 + o * 0.37
        const x = C + radius * Math.cos(angle)
        const y = C + radius * Math.sin(angle)
        const moons = chains
          .filter((m) => m.parent === chain.id)
          .slice(0, 6)
          .map((m, j, all) => {
            const a = angle + ((j - (all.length - 1) / 2) * 0.55)
            return { chain: m, x: x + 15 * Math.cos(a), y: y + 15 * Math.sin(a), r: 1.8, ...colorOf(m, healthKnown), moons: [] }
          })
        out.push({ chain, x, y, r: Math.min(8, 3.2 + chain.rpcs.length * 0.42), ...colorOf(chain, healthKnown), moons })
      })
    })
    return out
  }, [chains, healthKnown])

  const eth = byId.get("1")
  const moonCount = dots.reduce((a, d) => a + d.moons.length, 0)
  return (
    <svg className="atlas" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`Ethereum at the centre with ${dots.length} layer 2 networks on orbits and ${moonCount} layer 3 networks around them`}>
      <defs>
        <radialGradient id="atlas-core">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".3" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r="120" fill="url(#atlas-core)" />
      {ORBITS.map((r) => (
        <circle key={r} cx={C} cy={C} r={r} className="orbit" />
      ))}
      {ORBITS.slice(0, 3).map((r, i) => (
        <circle key={r} r="2" className="comet">
          <animateMotion dur={`${26 + i * 14}s`} repeatCount="indefinite" path={`M${C - r},${C}a${r},${r} 0 1,${i % 2} ${2 * r},0a${r},${r} 0 1,${i % 2} ${-2 * r},0`} />
        </circle>
      ))}
      {dots.map((d) => (
        <g key={d.chain.id} className={hot && hot !== d.chain.id ? "adim" : ""}>
          {d.moons.map((m) => (
            <g key={m.chain.id}>
              <line x1={d.x} y1={d.y} x2={m.x} y2={m.y} className="moonl" />
              <a href={href(`chain/${m.chain.id}`)} aria-label={m.chain.name} tabIndex={-1}>
                <circle cx={m.x} cy={m.y} r={7} fill="transparent" {...hover(<TipRow value={m.chain.name} label={`Layer 3 · ${m.state}`} color={m.color} />)} />
                <circle cx={m.x} cy={m.y} r={m.r} fill={m.color} pointerEvents="none" />
              </a>
            </g>
          ))}
          <a href={href(`chain/${d.chain.id}`)} aria-label={d.chain.name} tabIndex={-1} onPointerEnter={() => setHot(d.chain.id)} onPointerLeave={() => setHot(null)}>
            <circle cx={d.x} cy={d.y} r={12} fill="transparent" {...hover(<TipRow value={d.chain.name} label={d.state} color={d.color} />)} />
            <circle cx={d.x} cy={d.y} r={d.r} fill={d.color} className="adot" pointerEvents="none" />
          </a>
          {LABELS.has(d.chain.id) && (
            <text x={d.x} y={d.y - d.r - 5} textAnchor="middle" className="alabel" pointerEvents="none">
              {d.chain.name.replace(/ (Mainnet|One)$/, "")}
            </text>
          )}
        </g>
      ))}
      {eth && (
        <a href={href("chain/1")} aria-label="Ethereum Mainnet" tabIndex={-1}>
          <circle cx={C} cy={C} r="30" className="acore" />
          <path d={`M${C} ${C - 19}l-11.5 19.2 11.5 6.8 11.5-6.8zM${C} ${C + 9.2}l-11.5-6.8 11.5 16.3 11.5-16.3z`} fill="var(--on-accent)" />
        </a>
      )}
    </svg>
  )
}
