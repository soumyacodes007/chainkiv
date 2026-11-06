// Same commit, same root: reads the commit from git objects and prints the root.
import { fetchCommit, leavesOf, readSource } from "../src/source"
import { merkleRoot, encodeManifest } from "../src/release"
const dir = process.argv[2] ?? ".chainkiv/upstream"
const commit = process.argv[3] ?? (await fetchCommit(dir, "HEAD"))
const t = performance.now()
const s = await readSource(dir, commit)
const leaves = leavesOf(s)
console.log({ commit, chains: s.chains.length, rpcs: s.chains.reduce((n, c) => n + c.rpcs.length, 0), explorers: s.chains.reduce((n, c) => n + c.explorers.length, 0), warnings: s.warnings.length, root: merkleRoot(leaves), manifestParts: encodeManifest(leaves).map((p) => p.length), ms: Math.round(performance.now() - t) })
console.log(s.warnings.slice(0, 10))
