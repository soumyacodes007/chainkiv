// Recheck: the visitor's own browser asks the RPC the same three questions a prober asks, so nobody has to take a
// prober's word for it. Browsers block many RPCs (CORS, plain http), and that is reported, never counted as down.
export type Recheck = { state: "ok" | "blocked" | "failed"; chainId?: number; head?: number; headHash?: string; genesis?: string; latencyMs?: number; error?: string; at: number }

async function call(url: string, method: string, params: unknown[]) {
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const response = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
    if (!response.ok) throw Object.assign(new Error(`The RPC answered with HTTP ${response.status}`), { answered: true })
    const body = await response.json()
    if (body.error) throw Object.assign(new Error(body.error.message ?? "RPC error"), { answered: true })
    return { result: body.result, ms: performance.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

export async function recheck(url: string): Promise<Recheck> {
  const at = Date.now() / 1000
  if (url.startsWith("ws")) return { state: "blocked", error: "WebSocket RPCs are checked by probers only", at }
  if (location.protocol === "https:" && url.startsWith("http:")) return { state: "blocked", error: "This browser refuses plain http calls from a secure page", at }
  try {
    const id = await call(url, "eth_chainId", [])
    const zero = await call(url, "eth_getBlockByNumber", ["0x0", false])
    const head = await call(url, "eth_getBlockByNumber", ["latest", false])
    const times = [id.ms, zero.ms, head.ms].sort((a, b) => a - b)
    return { state: "ok", chainId: Number(id.result), genesis: zero.result?.hash, head: Number(head.result?.number), headHash: head.result?.hash, latencyMs: times[1]!, at }
  } catch (e: any) {
    if (e?.answered) return { state: "failed", error: e.message, at }
    if (e?.name === "AbortError") return { state: "failed", error: "No answer in 6 seconds", at }
    return { state: "blocked", error: "The RPC does not allow calls from browsers (CORS), or it is unreachable from here", at }
  }
}

export async function probeChainId(url: string): Promise<number | null> {
  try {
    return Number((await call(url, "eth_chainId", [])).result)
  } catch {
    return null
  }
}
