// Reads a commit of ethereum-lists/chains from git objects. Working-copy bytes are never used: line-ending settings
// change them, which would give a different root on different machines.
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { deriveChain, deriveExplorers, deriveRpcs, parseFile, validate, type ChainAttrs, type ExplorerAttrs, type RpcAttrs } from "./derive"
import type { Leaf } from "./release"

export const UPSTREAM = "https://github.com/ethereum-lists/chains.git"
const CHAINS_PATH = "_data/chains/"

export type SourceChain = { path: string; raw: Uint8Array; attrs: ChainAttrs; rpcs: RpcAttrs[]; explorers: ExplorerAttrs[]; conflict: boolean }
export type Source = { commit: string; chains: SourceChain[]; warnings: string[] }

async function git(dir: string, args: string[], input?: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["git", "-C", dir, ...args], { stdin: input === undefined ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe" })
  if (input !== undefined) {
    const stdin = proc.stdin as import("bun").FileSink
    stdin.write(input)
    await stdin.end()
  }
  const [buffer, err, code] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`git ${args[0]} failed: ${err.trim().slice(0, 300)}`)
  return new Uint8Array(buffer)
}

/** Makes sure `dir` holds the commit and returns its full SHA. */
export async function fetchCommit(dir: string, ref: string, url = UPSTREAM): Promise<string> {
  if (!existsSync(`${dir}/.git`)) {
    await mkdir(dir, { recursive: true })
    await git(dir, ["init", "-q"])
    await git(dir, ["remote", "add", "origin", url])
  }
  await git(dir, ["fetch", "-q", "--depth", "1", "origin", ref])
  return new TextDecoder().decode(await git(dir, ["rev-parse", "FETCH_HEAD"])).trim()
}

async function readBlobs(dir: string, ids: string[]): Promise<Map<string, Uint8Array>> {
  const out = await git(dir, ["cat-file", "--batch"], ids.join("\n") + "\n")
  const blobs = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  let at = 0
  while (at < out.length) {
    const end = out.indexOf(10, at)
    const [id, type, size] = decoder.decode(out.subarray(at, end)).split(" ")
    if (type !== "blob") throw new Error(`git object ${id} is ${type}`)
    const start = end + 1
    blobs.set(id!, out.subarray(start, start + Number(size)))
    at = start + Number(size) + 1
  }
  return blobs
}

export async function readSource(dir: string, commit: string): Promise<Source> {
  const listing = new TextDecoder().decode(await git(dir, ["ls-tree", "-r", commit, "--", CHAINS_PATH]))
  const files = listing.trim().split("\n").map((line) => {
    const [meta, path] = line.split("\t") as [string, string]
    return { id: meta.split(" ")[2]!, path }
  }).filter((f) => f.path.endsWith(".json"))
  const blobs = await readBlobs(dir, files.map((f) => f.id))

  const warnings: string[] = []
  const chains: SourceChain[] = []
  for (const { id, path } of files) {
    const raw = blobs.get(id)!
    try {
      const file = parseFile(raw)
      for (const problem of validate(file)) warnings.push(`${path}: ${problem}`)
      const attrs = deriveChain(raw)
      if (attrs.sourceBlob !== id) throw new Error(`blob id ${attrs.sourceBlob} does not match git's ${id}`)
      chains.push({ path, raw, attrs, rpcs: deriveRpcs(file), explorers: deriveExplorers(file), conflict: false })
    } catch (error) {
      warnings.push(`${path}: ${(error as Error).message}`)
    }
  }

  const count = (pick: (c: SourceChain) => string) => {
    const seen = new Map<string, number>()
    for (const c of chains) seen.set(pick(c), (seen.get(pick(c)) ?? 0) + 1)
    return seen
  }
  const ids = count((c) => c.attrs.chainId.toString())
  const names = count((c) => c.attrs.shortName)
  for (const c of chains) {
    if (ids.get(c.attrs.chainId.toString())! > 1 || names.get(c.attrs.shortName)! > 1) {
      c.conflict = true
      warnings.push(`${c.path}: chainId or shortName is used by another file`)
    }
  }
  return { commit, chains, warnings }
}

export const leavesOf = (source: Source): Leaf[] =>
  source.chains.map((c) => ({ chainId: c.attrs.chainId, shortName: c.attrs.shortName, sourceBlob: c.attrs.sourceBlob }))
