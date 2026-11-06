#!/usr/bin/env bun
// chainkiv: import, survey, probe, verify and query. Keys come from the environment and are never printed.
import { type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { LOCAL_CHAIN_ID, localNetwork, rabdiNetwork, reader, writer, type Network } from "./arkiv"
import { createRegistry } from "./client"
import { apply, plan, readExisting, writeRelease } from "./importer"
import { loadTargets, openHistory, publishStats, runRound } from "./prober"
import { merkleRoot, type ReleaseMeta } from "./release"
import { fetchCommit, leavesOf, readSource } from "./source"
import { summarise, survey } from "./survey"
import { ethereumChain, ethereumReader, readAnchor, sendAnchor, trustFromEns } from "./trust"

const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const HOME = process.env.CHAINKIV_HOME ?? ".chainkiv"

function args(list: string[]) {
  const flags: Record<string, string> = {}
  const rest: string[] = []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    if (!item.startsWith("--")) rest.push(item)
    else if (list[i + 1] === undefined || list[i + 1]!.startsWith("--")) flags[item.slice(2)] = "true"
    else flags[item.slice(2)] = list[++i]!
  }
  return { flags, rest }
}

function network(): Network {
  if (process.env.ARKIV_NETWORK === "local") return localNetwork(process.env.ARKIV_RPC ?? "http://127.0.0.1:18645")
  return rabdiNetwork(process.env.ARKIV_ACCESS_KEY ?? "")
}

function keyFor(name: string, net: Network) {
  const key = process.env[name]
  if (!key) throw new Error(`Set ${name}. Run "chainkiv new-wallet" to make one.`)
  if (key.toLowerCase() === DEV_KEY && net.chain.id !== LOCAL_CHAIN_ID) throw new Error(`${name} is the public dev key; it only works on a local chain.`)
  return privateKeyToAccount(key as Hex)
}

/** Anchors live on Ethereum. A local run uses the local chain and says so, because no ENS is involved. */
function trustSetup(net: Network) {
  if (net.chain.id === LOCAL_CHAIN_ID) {
    const client = reader(net)
    return {
      label: "local test chain",
      client,
      resolve: async () => {
        const publisher = process.env.CHAINKIV_PUBLISHER
        const anchorTx = process.env.CHAINKIV_ANCHOR_TX
        if (!publisher || !anchorTx) throw new Error("Set CHAINKIV_PUBLISHER and CHAINKIV_ANCHOR_TX for a local run")
        return { publisher, anchorTx, source: "local test settings" }
      },
    }
  }
  const chain = ethereumChain(process.env.ETH_NETWORK ?? "sepolia")
  const client = ethereumReader(chain, process.env.ETH_RPC_URL)
  const name = process.env.ENS_NAME
  return {
    label: chain.name,
    client,
    resolve: async () => {
      if (!name) throw new Error("Set ENS_NAME to the publisher's ENS name")
      return trustFromEns(client, name)
    },
  }
}

function registry(net: Network) {
  const setup = trustSetup(net)
  return createRegistry({
    network: net,
    trust: setup.resolve,
    readAnchor: (tx) => readAnchor(setup.client, tx as Hex),
    ...(process.env.CHAINKIV_SKIP_GITHUB === "1" ? { upstream: async () => { throw new Error("GitHub check turned off for this run") } } : {}),
  })
}

async function loadMeta(path: string | undefined): Promise<ReleaseMeta> {
  const probers = (process.env.CHAINKIV_PROBERS ?? "").split(",").map((p) => p.trim()).filter(Boolean)
  if (!path) return { v: 1, probers, genesis: {} }
  const file = (await Bun.file(path).json()) as Partial<ReleaseMeta>
  return { v: 1, probers: file.probers ?? probers, genesis: file.genesis ?? {} }
}

async function source(flags: Record<string, string>) {
  const dir = flags.repo ?? `${HOME}/upstream`
  const commit = flags.repo && flags.commit ? flags.commit : await fetchCommit(dir, flags.commit ?? "HEAD")
  return readSource(dir, commit)
}

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)
const print = (value: unknown) => console.log(JSON.stringify(value, replacer, 2))

const commands: Record<string, (flags: Record<string, string>, rest: string[]) => Promise<void>> = {
  async "new-wallet"() {
    const key = generatePrivateKey()
    console.log(`Address: ${privateKeyToAccount(key).address}`)
    console.log("Put this line in .env.local. It is shown once and never written anywhere else:")
    console.log(key)
  },

  async import(flags) {
    const started = Date.now()
    const src = await source(flags)
    const root = merkleRoot(leavesOf(src))
    console.log(`Commit ${src.commit}\nChains ${src.chains.length}\nRoot ${root}\nWarnings ${src.warnings.length}`)
    for (const warning of src.warnings.slice(0, 20)) console.log(`  ${warning}`)
    if (flags["root-only"]) return

    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const client = reader(net)
    const wallet = writer(net, account)
    const head = await client.getBlockNumber()
    const work = plan(src, await readExisting(client, account.address), head)
    print(work.counts)
    if (flags["dry-run"]) return

    const batches = await apply(wallet, work, Number(flags.batch ?? 20), (done, total) => {
      if (done % 10 === 0 || done === total) console.log(`Batch ${done}/${total}, ${Math.round((Date.now() - started) / 1000)}s`)
    })
    const anchorOn = flags.anchor ?? "none"
    let anchorTx: string | undefined
    if (anchorOn !== "none") {
      const meta = await loadMeta(flags.meta)
      const release = await writeRelease(client, wallet, account.address, src, meta, anchorOn)
      const anchor = { releaseNo: release.releaseNo.toString(), commit: src.commit, root: release.root, chainCount: release.chainCount, metaHash: release.metaHash }
      anchorTx = net.chain.id === LOCAL_CHAIN_ID
        ? await sendAnchor(net.chain, net.url, account, anchor)
        : await sendAnchor(ethereumChain(anchorOn), process.env.ETH_RPC_URL, account, anchor)
      console.log(`Anchored release ${anchor.releaseNo} on ${anchorOn}: ${anchorTx}`)
      console.log("Set the ENS text record arkiv.latestAnchor to this transaction hash.")
    }
    print({ publisher: account.address, batches, anchorTx, seconds: Math.round((Date.now() - started) / 1000) })
  },

  async survey(flags) {
    const src = await source(flags)
    const started = Date.now()
    const result = await survey(src, { onProgress: (done, total) => console.log(`${done}/${total}`) })
    print(summarise(result))
    await Bun.write(`${HOME}/survey.json`, JSON.stringify({ commit: src.commit, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), summary: summarise(result), genesis: Object.fromEntries(result.genesis), rows: result.rows }, replacer))
    process.exit(0)
  },

  async probe(flags) {
    const net = network()
    const account = keyFor("PROBER_KEY", net)
    const reg = registry(net)
    const client = reader(net)
    const wallet = writer(net, account)
    const publisher = (await reg.trust()).publisher
    const history = openHistory(`${HOME}/prober-${account.address.slice(2, 10)}.db`)
    const only = flags.chains?.split(",").map((id) => BigInt(id))
    const everySeconds = Number(flags.every ?? 0)
    const region = flags.region ?? process.env.PROBER_REGION ?? "unknown"
    for (let round = 1; ; round++) {
      const targets = await loadTargets(client, publisher, Number(flags.tier ?? 1), only)
      const meta = await reg.meta().catch(() => null)
      const result = await runRound({ client, wallet, account, region, targets, genesis: meta?.genesis ?? {}, history })
      console.log(`Round ${round}: ${result.up}/${result.probed} up, ${result.created} created, ${result.patched} patched, ${result.seconds}s`)
      if (flags.stats || round % 6 === 1) console.log(`Stats written for ${await publishStats({ client, wallet, account, targets, history })} RPCs`)
      if (!everySeconds) return
      await Bun.sleep(everySeconds * 1000)
    }
  },

  async verify(flags, rest) {
    const reg = registry(network())
    if (flags.all) {
      const { check, results, missing, verified } = await reg.verifyAll()
      for (const s of check.steps) console.log(`${s.status.padEnd(8)} ${s.label}: ${s.detail}`)
      const bad = results.filter((r) => !r.verdict.ok)
      console.log(`Verified ${verified} of ${results.length}. Signed for ${check.anchor?.chainCount ?? "?"}. Missing from Arkiv: ${missing.length}`)
      for (const r of bad.slice(0, 10)) console.log(`  ${r.chainId}: ${r.verdict.state}: ${r.verdict.steps.find((s) => s.status === "fail")?.detail ?? "a step could not run"}`)
      if (bad.length || missing.length) process.exitCode = 1
      return
    }
    if (!rest[0]) throw new Error("Usage: chainkiv verify <chainId> | --all")
    const verdict = await reg.verify(BigInt(rest[0]))
    for (const s of verdict.steps) console.log(`${s.status.padEnd(8)} ${s.label}: ${s.detail}`)
    console.log(verdict.ok ? `Verified, release ${verdict.release}, commit ${verdict.commit?.slice(0, 10)}. Signed by demo publisher.` : `Not verified: ${verdict.state}`)
    if (!verdict.ok) process.exitCode = 1
  },

  async chain(_, rest) {
    const reg = registry(network())
    const id = BigInt(rest[0] ?? 1)
    const chain = await reg.getChain(id)
    print({ chain: chain && { ...chain, raw: undefined, file: undefined }, rpcs: await reg.rpcs(id), health: await reg.health(id), healthy: await reg.healthyRpcs(id) })
  },

  async query(_, rest) {
    if (!rest[0]) throw new Error("Usage: chainkiv query '<arkiv query>'")
    const net = network()
    const response = await fetch(net.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "arkiv_query", params: [rest[0], { includeData: { attributes: true, key: true } }] }),
    })
    print(await response.json())
  },

  async doctor() {
    const net = network()
    const client = reader(net)
    console.log(`Arkiv network ${net.name}, block ${await client.getBlockNumber()}`)
    console.log(`Access key ${process.env.ARKIV_ACCESS_KEY ? "set" : "not set, using the public endpoint"}`)
    for (const name of ["PUBLISHER_KEY", "PROBER_KEY", "VALIDATOR_KEY"]) {
      if (!process.env[name]) {
        console.log(`${name} not set`)
        continue
      }
      const account = keyFor(name, net)
      console.log(`${name} ${account.address}: ${await client.getBalance({ address: account.address })} wei on Arkiv`)
    }
    const setup = trustSetup(net)
    try {
      print(await setup.resolve())
    } catch (error) {
      console.log(`Publisher lookup on ${setup.label}: ${(error as Error).message}`)
    }
  },
}

const [name = "help", ...list] = process.argv.slice(2)
const command = commands[name]
if (!command) {
  console.log(`chainkiv <command>

  import    --commit <sha> [--repo dir] [--dry-run] [--root-only] [--anchor sepolia|mainnet|none] [--meta file]
  survey    Probe every listed RPC, read-only, no wallet needed
  probe     --tier 1|2|3 [--chains 1,8453] [--every seconds] [--region name]
  verify    <chainId> | --all
  chain     <chainId>
  query     '<arkiv query>'
  doctor    Check network, wallets and the publisher lookup
  new-wallet`)
  process.exit(name === "help" ? 0 : 1)
}
const { flags, rest } = args(list)
try {
  await command(flags, rest)
} catch (error) {
  console.error((error as Error).message.split("\n")[0])
  process.exit(1)
}
