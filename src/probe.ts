// Probes one RPC. Every URL here comes from a public list, so it is treated as hostile: private addresses are refused,
// redirects are not followed, and responses are capped.
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export const VERSION = "0.1.0"
const USER_AGENT = `chainkiv-prober/${VERSION} (+https://github.com/soumyacodes007/chainkiv)`
const TIMEOUT_MS = 5_000
// A full Ethereum block listing only hashes passed 100 KB in testing, so this has to stay well above that.
export const MAX_RESPONSE = 1024 * 1024

export type Outcome = "ok" | "timeout" | "dns" | "refused" | "tls" | "http" | "rate-limited" | "bad-response" | "blocked" | "rpc-error" | "skipped"

export type Reading = {
  chainId: bigint
  url: string
  up: boolean
  chainIdOk: boolean
  reportedChainId: string | null
  genesisSeen: string
  blockNumber: bigint
  blockHash: string
  blockTime: number
  latencyMs: number
  outcome: Outcome
  error: string
  checkedAt: number
}

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase()
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7))
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
  }
  const [a = 0, b = 0] = ip.split(".").map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export async function refusedHost(host: string): Promise<string | null> {
  const name = host.replace(/^\[|\]$/g, "")
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal")) return "local hostname"
  const addresses = isIP(name) ? [{ address: name }] : await lookup(name, { all: true })
  return addresses.some((a) => isPrivateAddress(a.address)) ? "private address" : null
}

const HASH = /^0x[0-9a-fA-F]{64}$/

class ProbeError extends Error {
  constructor(readonly outcome: Outcome, message: string) {
    super(message)
  }
}

export async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_RESPONSE) {
      await reader.cancel()
      throw new ProbeError("bad-response", "response over 1 MB")
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

function classify(error: unknown): ProbeError {
  if (error instanceof ProbeError) return error
  const e = error as { name?: string; code?: string; message?: string }
  const text = `${e.name ?? ""} ${e.code ?? ""} ${e.message ?? ""}`
  if (/abort|timeout/i.test(text)) return new ProbeError("timeout", "timed out")
  if (/ENOTFOUND|EAI_|DNS|FailedToOpenSocket.*resolve/i.test(text)) return new ProbeError("dns", "name does not resolve")
  if (/CERT|TLS|SSL|self.signed/i.test(text)) return new ProbeError("tls", "TLS failure")
  if (/ECONNREFUSED|ConnectionRefused|ECONNRESET|ConnectionClosed|socket/i.test(text)) return new ProbeError("refused", "connection failed")
  return new ProbeError("http", (e.message ?? "request failed").slice(0, 100))
}

type Call = (method: string, params: unknown[]) => Promise<unknown>

function httpCall(url: string): Call {
  let id = 0
  return async (method, params) => {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    })
    if (response.status === 429) throw new ProbeError("rate-limited", "HTTP 429")
    const text = await readCapped(response)
    if (!response.ok) throw new ProbeError("http", `HTTP ${response.status}`)
    return parseRpc(text)
  }
}

function parseRpc(text: string): unknown {
  let body: { result?: unknown; error?: { message?: string } }
  try {
    body = JSON.parse(text)
  } catch {
    throw new ProbeError("bad-response", "response is not JSON")
  }
  if (body?.error) throw new ProbeError("rpc-error", String(body.error.message ?? "RPC error").slice(0, 100))
  if (body?.result === undefined || body.result === null) throw new ProbeError("bad-response", "empty result")
  return body.result
}

function wsCall(url: string): { call: Call; close: () => void } {
  const socket = new WebSocket(url)
  const open = new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new ProbeError("refused", "WebSocket failed"))
    setTimeout(() => reject(new ProbeError("timeout", "timed out")), TIMEOUT_MS)
  })
  let id = 0
  const pending = new Map<number, (text: string) => void>()
  socket.onmessage = (event) => {
    const text = String(event.data)
    if (text.length > MAX_RESPONSE) return socket.close()
    try {
      pending.get((JSON.parse(text) as { id: number }).id)?.(text)
    } catch {
      /* A malformed frame simply times out. */
    }
  }
  const call: Call = async (method, params) => {
    await open
    const requestId = ++id
    const text = await new Promise<string>((resolve, reject) => {
      pending.set(requestId, resolve)
      setTimeout(() => reject(new ProbeError("timeout", "timed out")), TIMEOUT_MS)
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }))
    })
    return parseRpc(text)
  }
  return { call, close: () => socket.close() }
}

/** RPC answers are hostile, and a value Arkiv refuses would fail the whole batch of readings it was written with. */
export function checkedBlock(block: { hash?: unknown; number?: unknown; timestamp?: unknown }) {
  if (typeof block?.hash !== "string" || !HASH.test(block.hash)) throw new ProbeError("bad-response", "block hash is not a hash")
  try {
    const number = BigInt(block.number as string)
    const time = BigInt(block.timestamp as string)
    if (number < 0n || number >= 2n ** 64n || time < 0n || time >= 2n ** 64n) throw new Error("out of range")
    return { hash: block.hash, number, time: Number(time) }
  } catch {
    throw new ProbeError("bad-response", "block number or time is not valid")
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

export async function probe(chainId: bigint, url: string, now = Date.now()): Promise<Reading> {
  const reading: Reading = {
    chainId, url, up: false, chainIdOk: false, reportedChainId: null, genesisSeen: "", blockNumber: 0n, blockHash: "",
    blockTime: 0, latencyMs: -1, outcome: "ok", error: "", checkedAt: Math.floor(now / 1000),
  }
  if (url.includes("${")) return { ...reading, outcome: "skipped", error: "needs an API key" }
  let close = () => {}
  try {
    const parsed = new URL(url)
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) throw new ProbeError("blocked", `unsupported scheme ${parsed.protocol}`)
    const refused = await refusedHost(parsed.hostname)
    if (refused) throw new ProbeError("blocked", refused)

    let call: Call
    if (parsed.protocol.startsWith("ws")) ({ call, close } = wsCall(url))
    else call = httpCall(url)

    const times: number[] = []
    const timed = async <T>(method: string, params: unknown[]) => {
      const start = performance.now()
      const result = (await call(method, params)) as T
      times.push(performance.now() - start)
      return result
    }
    const id = await timed<string>("eth_chainId", [])
    reading.reportedChainId = BigInt(id).toString()
    reading.chainIdOk = BigInt(id) === chainId
    // Pruned nodes refuse block 0 and still serve the head, so this leaves the genesis unknown, not the RPC down.
    try {
      const genesis = await timed<{ hash?: string }>("eth_getBlockByNumber", ["0x0", false])
      if (typeof genesis?.hash !== "string" || !HASH.test(genesis.hash)) throw new ProbeError("bad-response", "genesis hash is not a hash")
      reading.genesisSeen = genesis.hash
    } catch (error) {
      const outcome = classify(error).outcome
      if (outcome !== "rpc-error" && outcome !== "bad-response") throw error
    }
    const latest = checkedBlock(await timed<{ hash?: string; number?: string; timestamp?: string }>("eth_getBlockByNumber", ["latest", false]))
    reading.blockHash = latest.hash
    reading.blockNumber = latest.number
    reading.blockTime = latest.time
    reading.latencyMs = Math.round(median(times))
    reading.up = true
  } catch (error) {
    const classified = classify(error)
    reading.outcome = classified.outcome
    reading.error = classified.message
  } finally {
    close()
  }
  return reading
}

const CANARIES = ["https://www.cloudflare.com/cdn-cgi/trace", "https://www.google.com/generate_204"]
let lastCheck = 0
let lastResult: Promise<boolean> = Promise.resolve(true)

/** Is this machine online? A failed probe says nothing about an RPC when the answer is no. */
export function networkOk(): Promise<boolean> {
  if (Date.now() - lastCheck < 3_000) return lastResult
  lastCheck = Date.now()
  lastResult = Promise.any(CANARIES.map(async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": USER_AGENT } })
    if (response.status >= 500) throw new Error("canary failed")
  })).then(() => true, () => false)
  return lastResult
}

export async function waitForNetwork(onWait?: () => void) {
  while (!(await networkOk())) {
    onWait?.()
    await Bun.sleep(5_000)
  }
}

const NETWORK_OUTCOMES: Outcome[] = ["timeout", "dns", "refused", "tls"]

/** Probes, and throws a reading away if this machine lost its connection during the probe. */
export async function probeOnline(chainId: bigint, url: string, onWait?: () => void): Promise<Reading> {
  for (;;) {
    await waitForNetwork(onWait)
    const reading = await probe(chainId, url)
    if (reading.up || !NETWORK_OUTCOMES.includes(reading.outcome)) return reading
    lastCheck = 0
    if (await networkOk()) return reading
  }
}

/** Runs tasks with a global limit and at most `perHost` at once for each host. */
export async function pool<T, R>(items: T[], limit: number, perHost: number, host: (item: T) => string, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  const active = new Map<string, number>()
  const waiting = items.map((item, index) => ({ item, index }))
  await new Promise<void>((resolve) => {
    let running = 0
    const next = () => {
      if (!waiting.length && !running) return resolve()
      for (let i = 0; i < waiting.length && running < limit; ) {
        const job = waiting[i]!
        const name = host(job.item)
        if ((active.get(name) ?? 0) >= perHost) {
          i++
          continue
        }
        waiting.splice(i, 1)
        running++
        active.set(name, (active.get(name) ?? 0) + 1)
        run(job.item).then((result) => {
          results[job.index] = result
        }).finally(() => {
          running--
          active.set(name, active.get(name)! - 1)
          next()
        })
      }
    }
    next()
  })
  return results
}
