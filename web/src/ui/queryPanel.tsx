// Shows the Arkiv query behind the current filters, and runs it from this browser. Only clauses Arkiv really answers are
// shown. Fuzzy text, and anything worked out from health, is named as browser work instead of being dressed up as a query.
import { useEffect, useMemo, useState } from "react"
import { fmt } from "../lib/format"
import { reg } from "../lib/registry"
import { I } from "./icons"
import { copy, cx } from "./kit"

export type Filters = { q: string; kind: string; layer: string; status: string; flag: string }

const PAGE = 100
const SELECT = { key: true, owner: false, creator: false, createdAt: false, updatedAt: false, expiresAt: false, creationFlags: false, attributeSchema: false, attributes: { name: true } }

/** Text goes inside str('…'), so anything that could end the string stays out of the query. */
const safe = (text: string) => !/['\\]/.test(text)

function clausesFor({ q, layer, status, flag }: Filters) {
  const text = q.trim()
  const out: string[] = []
  if (/^\d+$/.test(text)) out.push(`chainId = u64(${BigInt(text)})`)
  else if (text && safe(text)) out.push(`name STARTSWITH str('${text}')`)
  if (layer !== "any") out.push(`layer = str('${layer}')`)
  if (status !== "any") out.push(`status = str('${status}')`)
  if (flag === "reused") out.push("reusedChainId = true")
  return out
}

function browserWork({ q, kind, flag }: Filters) {
  const out: string[] = []
  if (q.trim() && !/^\d+$/.test(q.trim())) out.push("fuzzy text match")
  if (kind !== "all") out.push(kind === "main" ? "mainnets only" : "testnets only")
  if (flag === "working") out.push("has a working RPC")
  if (flag === "norpc") out.push("no RPC listed")
  return out
}

type Result = { rows: number; more: boolean; ms: number; names: string[] } | { error: string }

export function QueryPanel({ filters }: { filters: Filters }) {
  const [owner, setOwner] = useState("")
  const [chosen, setChosen] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const clauses = useMemo(() => clausesFor(filters), [filters])
  const later = useMemo(() => browserWork(filters), [filters])
  const open = chosen ?? (clauses.length > 0 || !!filters.q.trim())
  const lines = ["arkiv.schema = str('chainkiv.chain')", ...clauses, `$owner = addr(${owner || "…"})`]
  const query = lines.join(" AND ")

  useEffect(() => {
    reg.trust().then((t) => setOwner(t.publisher), () => {})
  }, [])
  useEffect(() => setResult(null), [query])

  const run = async () => {
    setBusy(true)
    const started = performance.now()
    try {
      const answer = (await reg.client.request({ method: "arkiv_query", params: [query, { select: SELECT, limit: `0x${PAGE.toString(16)}` }] })) as { data: { attributes: { name: string; value: string }[] }[]; cursor?: string }
      setResult({ rows: answer.data.length, more: !!answer.cursor && answer.data.length === PAGE, ms: Math.round(performance.now() - started), names: answer.data.slice(0, 4).map((d) => d.attributes.find((a) => a.name === "name")?.value ?? "") })
    } catch (e) {
      const text = (e as Error).message
      setResult({ error: /429/.test(text) ? "Arkiv is limiting reads from this browser. Try again in a minute." : text.split("\n")[0]!.slice(0, 140) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cx("qpanel", open && "open")}>
      <div className="qh">
        <button className="qt-b" onClick={() => setChosen(!open)} aria-expanded={open}>
          <I n={open ? "chevron-down" : "chevron-right"} s={14} />
          <span className="qb">[A]</span>
          <b>Arkiv query</b>
          <span className="faint">{clauses.length ? `${clauses.length} ${clauses.length === 1 ? "filter" : "filters"}` : "behind this list"}</span>
        </button>
        {open && (
          <span className="qa">
            <button className="btn btn-ghost btn-sm" onClick={() => copy(query, "Query copied")} disabled={!owner}>
              <I n="copy" s={13} />
              Copy
            </button>
            <button className="btn btn-secondary btn-sm" onClick={run} disabled={!owner || busy}>
              <I n={busy ? "loader" : "terminal"} s={13} className={busy ? "spin" : undefined} />
              Run on Arkiv
            </button>
          </span>
        )}
      </div>
      {open && (
        <div className="qb-d">
          <pre aria-label="Arkiv query">
            {lines.map((line, i) => (
              <span key={line} className={cx("ql", i > 0 && i < lines.length - 1 && "new")}>
                <i>{i ? "AND " : ""}</i>
                {line}
              </span>
            ))}
          </pre>
          {later.length > 0 && <p className="qn">Done in your browser, because Arkiv matches exact values and prefixes: {later.join(", ")}.</p>}
          {result &&
            ("error" in result ? (
              <p className="qr bad">{result.error}</p>
            ) : (
              <p className="qr">
                <I n="check" s={13} />
                <span>
                  Arkiv returned <b>{result.more ? `${fmt(PAGE)}+ records` : `${fmt(result.rows)} ${result.rows === 1 ? "record" : "records"}`}</b> in {fmt(result.ms)} ms{result.names.length ? `: ${result.names.join(", ")}${result.rows > 4 ? "…" : ""}` : ""}
                </span>
              </p>
            ))}
        </div>
      )}
    </section>
  )
}
