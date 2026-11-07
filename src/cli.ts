#!/usr/bin/env bun
// chainkiv: import, survey, probe, verify and query. Keys come from the environment and are never printed.
import { SwarmCopy } from "./schemas"
import { checkCopy, encodeBundle, STAMP_LABEL, SWARM_BEE } from "./swarm"
import { mkdir } from "node:fs/promises"
import { formatEther, parseEther, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { ExpirationTime } from "@arkiv-network/sdk"
import { str, u64 } from "@arkiv-network/sdk/schema"
import { LOCAL_CHAIN_ID, localNetwork, rabdiNetwork, readAll, reader, val, writer, type Network } from "./arkiv"
import { CHAINLIST_FILE, CHAINLIST_REPO, hashRows, parseChainlist } from "./chainlist"
import { planChainlist, readChainlistExisting } from "./chainlist-import"
import { createRegistry } from "./client"
import { deployResolver, ensQuote, handOver, registerName, setRecords, setupProbers, type ProberState } from "./ens"
import { apply, CORE_DAYS, plan, readExisting, withReplan, writeRelease, type Plan } from "./importer"
import { loadTargets, openHistory, publishStats, runRound } from "./prober"
import { genesisOf, merkleRoot, type ReleaseMeta } from "./release"
import { Release } from "./schemas"
import { fetchCommit, leavesOf, readFileAt, readSource } from "./source"
import { summarise, survey } from "./survey"
import { ethereumChain, ethereumReader, readAnchor, sendAnchor, trustFromEns } from "./trust"

const DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const HOME = process.env.CHAINKIV_HOME ?? ".chainkiv"
/** The ENS records a routine release updates, which is all a hot key should be able to touch. */
const RELEASE_KEYS = ["arkiv.latestAnchor", "arkiv.root", "arkiv.release", "arkiv.metaHash"]

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
  const ref = Bun.file(`${HOME}/chainlist.json`)
  const chainlist = (await ref.exists()) ? ((await ref.json()) as ReleaseMeta["chainlist"]) : undefined
  const base = { v: 1 as const, ...(chainlist ? { chainlist } : {}) }
  if (!path) return { ...base, probers, genesis: {} }
  const file = (await Bun.file(path).json()) as Partial<ReleaseMeta>
  return { ...base, probers: file.probers ?? probers, genesis: file.genesis ?? {} }
}

async function source(flags: Record<string, string>) {
  const dir = flags.repo ?? `${HOME}/upstream`
  const commit = flags.repo && flags.commit ? flags.commit : await fetchCommit(dir, flags.commit ?? "HEAD")
  return readSource(dir, commit)
}

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)
const print = (value: unknown) => console.log(JSON.stringify(value, replacer, 2))
const retryNote = (error: unknown, attempt: number) => console.log(`Write failed (${(error as Error).message.split("\n")[0]}). Re-reading Arkiv, try ${attempt + 1}.`)

/** Runs a plan, and after any failure builds a fresh one from Arkiv, so nothing is written twice. */
async function applyPlan(first: Plan, replan: () => Promise<Plan>, write: (work: Plan) => Promise<number>) {
  let next: Plan | undefined = first
  let batches = 0
  await withReplan(async () => {
    const work: Plan = next ?? (await replan())
    next = undefined
    batches += await write(work)
  }, { onRetry: retryNote })
  return batches
}

/** The one stamp the tools may spend. Nook's own stamp has a different label, so it's never chosen. */
async function chainrollStamp(bee: string): Promise<string> {
  const { stamps } = (await (await fetch(`${bee}/stamps`)).json()) as { stamps: { batchID: string; label: string; usable: boolean }[] }
  const stamp = stamps.find((s) => s.label === STAMP_LABEL && s.usable)
  if (!stamp) throw new Error(`No usable stamp labelled ${STAMP_LABEL}. Run: chainkiv swarm-stamp --days 7 --confirm`)
  return stamp.batchID
}

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
    const fresh = async () => plan(src, await readExisting(client, account.address), await client.getBlockNumber())
    const work = await fresh()
    print(work.counts)
    if (flags["dry-run"]) return

    const anchorOn = flags.anchor ?? "none"
    const meta = anchorOn === "none" ? undefined : await loadMeta(flags.meta)
    // Checked before any write: apps trust only the probers named here, so an empty list would hide every reading.
    if (meta && !meta.probers.length) throw new Error("No probers to sign into this release. Set CHAINKIV_PROBERS or use --meta.")

    const batches = await applyPlan(work, fresh, (next) => apply(wallet, next, Number(flags.batch ?? 20), (done, total) => {
      if (done % 10 === 0 || done === total) console.log(`Batch ${done}/${total}, ${Math.round((Date.now() - started) / 1000)}s`)
    }))
    let anchorTx: string | undefined
    if (meta) {
      const release = await withReplan(() => writeRelease(client, wallet, account.address, src, meta, anchorOn), { onRetry: retryNote })
      const anchor = { releaseNo: release.releaseNo.toString(), commit: src.commit, root: release.root, chainCount: release.chainCount, metaHash: release.metaHash }
      anchorTx = net.chain.id === LOCAL_CHAIN_ID
        ? await sendAnchor(net.chain, net.url, account, anchor)
        : await sendAnchor(ethereumChain(anchorOn), process.env.ETH_RPC_URL, account, anchor)
      console.log(`Anchored release ${anchor.releaseNo} on ${anchorOn}: ${anchorTx}`)
      // The anchor is already on Ethereum, so a failure here must not hide the hash above.
      try {
        const rows = await readAll<any>(client, { schema: Release, owner: account.address, select: { releaseNo: true } })
        const row = rows.find((r) => val<bigint>(r.releaseNo) === BigInt(anchor.releaseNo))
        if (row) await wallet.patchEntity(Release, row.$key, { set: { anchorTx: str(anchorTx) } })
      } catch (error) {
        console.log(`Could not save the anchor on the release record: ${(error as Error).message.split("\n")[0]}`)
      }
      console.log(`Now run ens-records --anchor ${anchorTx}. Until then Verify fails, because ENS still names the old root.`)
    }
    print({ publisher: account.address, batches, anchorTx, seconds: Math.round((Date.now() - started) / 1000) })
  },

  async "import-chainlist"(flags) {
    const dir = flags.repo ?? `${HOME}/chainlist`
    const commit = flags.repo && flags.commit ? flags.commit : await fetchCommit(dir, flags.commit ?? "HEAD", CHAINLIST_REPO)
    const list = parseChainlist(await readFileAt(dir, commit, CHAINLIST_FILE))
    console.log(`Chainlist commit ${commit}\nRPCs ${list.rpcs.length}\nPolicies ${list.policies.size}\nWarnings ${list.warnings.length}`)
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const client = reader(net)
    const fresh = async () => planChainlist(list, commit, await readChainlistExisting(client, account.address), await client.getBlockNumber())
    const work = await fresh()
    print(work.counts)
    if (flags["dry-run"]) return
    const wallet = writer(net, account)
    await applyPlan(work, fresh, (next) => apply(wallet, next, Number(flags.batch ?? 20), (done, total) => {
      if (done % 10 === 0 || done === total) console.log(`Batch ${done}/${total}`)
    }))
    await Bun.write(`${HOME}/chainlist.json`, JSON.stringify({ commit, hash: hashRows(list), count: list.rpcs.length }))
    console.log("Done. The next anchored release will cover this data.")
  },

  async survey(flags) {
    const src = await source(flags)
    const started = Date.now()
    const result = await survey(src, { onProgress: (done, total) => console.log(`${done}/${total}`) })
    print(summarise(result))
    await Bun.write(`${HOME}/survey.json`, JSON.stringify({ commit: src.commit, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), summary: summarise(result), genesis: Object.fromEntries(result.genesis), rows: result.rows }, replacer))
    process.exit(0)
  },

  /** Writes the signed-release facts that do not come from git: the prober list and the agreed first blocks. */
  async "release-meta"(flags) {
    const probers = (process.env.CHAINKIV_PROBERS ?? "").split(",").map((p) => p.trim()).filter(Boolean)
    if (!probers.length) throw new Error("Set CHAINKIV_PROBERS to the prober addresses, separated by commas")
    const saved = (await Bun.file(flags.survey ?? `${HOME}/survey.json`).json()) as { genesis: Record<string, { hash: string | null }> }
    const genesis = genesisOf(saved.genesis)
    const path = flags.out ?? `${HOME}/meta.json`
    await Bun.write(path, JSON.stringify({ probers, genesis }))
    console.log(`Wrote ${path}: ${probers.length} probers, agreed first blocks for ${Object.keys(genesis).length} chains`)
  },

  async probe(flags) {
    const net = network()
    const account = keyFor("PROBER_KEY", net)
    const reg = registry(net)
    const client = reader(net)
    const wallet = writer(net, account)
    const publisher = flags.publisher ?? (await reg.trust()).publisher
    await mkdir(HOME, { recursive: true })
    const history = openHistory(`${HOME}/prober-${account.address.slice(2, 10)}.db`)
    const only = flags.chains?.split(",").map((id) => BigInt(id))
    const everySeconds = Number(flags.every ?? 0)
    const region = flags.region ?? process.env.PROBER_REGION ?? "unknown"
    for (let round = 1; ; round++) {
      try {
        const targets = await loadTargets(client, publisher, Number(flags.tier ?? 1), only)
        // A new registry each round, because one caches the release and this loop outlives it.
        const meta = await registry(net).meta().catch(() => null)
        const result = await runRound({ client, wallet, account, region, targets, genesis: meta?.genesis ?? {}, history })
        console.log(`Round ${round}: ${result.up}/${result.probed} up, ${result.created} created, ${result.patched} patched, ${result.seconds}s`)
        if (flags.stats || round % 6 === 1) console.log(`Stats written for ${await publishStats({ client, wallet, account, targets, history })} RPCs`)
      } catch (error) {
        // A one-off run should fail loudly. A daemon should survive, or every reading it published expires.
        if (!everySeconds) throw error
        console.error(`Round ${round} failed: ${(error as Error).message.split("\n")[0]}`)
      }
      if (!everySeconds) return
      await Bun.sleep(everySeconds * 1000)
    }
  },

  async verify(flags, rest) {
    const reg = registry(network())
    if (flags.chainlist) {
      const result = await reg.verifyChainlist()
      console.log(`${result.ok ? "pass" : "fail"}     Chainlist data: ${result.detail}`)
      if (!result.ok) process.exitCode = 1
      return
    }
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
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "arkiv_query", params: [rest[0], { select: { key: true, owner: true, attributes: { chainId: true, name: true, shortName: true, url: true, status: true } }, limit: "0x14" }] }),
    })
    print(await response.json())
  },

  /** Moves testnet tGLM between this project's own wallets. Nothing else is accepted as a target. */
  async "fund-probers"(flags) {
    const net = network()
    const fromProber = flags.from === "prober-a"
    if (flags.from && !fromProber) throw new Error("--from only accepts prober-a")
    const payer = keyFor(fromProber ? "PROBER_KEY" : "PUBLISHER_KEY", net)
    const amount = parseEther(flags.amount ?? "1")
    const client = reader(net)
    const wallet = writer(net, payer)
    for (const name of fromProber ? ["PROBER_B_KEY"] : ["PROBER_KEY", "PROBER_B_KEY"]) {
      const target = keyFor(name, net).address
      console.log(`${flags["dry-run"] ? "Would send" : "Sending"} ${formatEther(amount)} tGLM to ${name.replace("_KEY", "")} ${target}`)
      if (flags["dry-run"]) continue
      const hash = await wallet.sendTransaction({ to: target, value: amount })
      await client.waitForTransactionReceipt({ hash })
      console.log(`Done: ${hash}`)
    }
    console.log(`${fromProber ? "Prober A" : "Publisher"} balance ${formatEther(await client.getBalance({ address: payer.address }))} tGLM`)
  },

  /** Sepolia only: the fee is free MockUSDC. The resolver is saved so a rerun does not deploy a second one. */
  async "ens-register"(flags) {
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const name = flags.name ?? process.env.ENS_NAME
    if (!name) throw new Error("Pass --name chainroll.eth or set ENS_NAME")
    if ((process.env.ETH_NETWORK ?? "sepolia") !== "sepolia") throw new Error("ens-register only runs on Sepolia")
    const url = process.env.ETH_RPC_URL
    const quote = await ensQuote(url, account, name)
    console.log(`${name}: ${quote.available ? `available, ${Number(quote.total) / 1e6} MockUSDC for 1 year` : "not available"}`)
    if (flags["dry-run"] || !quote.available) return
    const saved = Bun.file(`${HOME}/ens.json`)
    const state = (await saved.exists()) ? await saved.json() : {}
    state.resolver ??= await deployResolver(url, account)
    await Bun.write(saved, JSON.stringify(state))
    console.log(`Resolver ${state.resolver}`)
    await registerName(url, account, name, state.resolver, console.log)
    await Bun.write(saved, JSON.stringify({ ...state, name }))
    console.log(`Registered ${name} to ${account.address}`)
  },

  async "ens-records"(flags) {
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    if (!flags.anchor) throw new Error("Pass --anchor <transaction hash>")
    const { name, resolver, ens } = await Bun.file(`${HOME}/ens.json`).json()
    if (!name || !resolver) throw new Error("Run ens-register first")
    // The root is copied from the anchor itself, so this cannot name a release that was never signed.
    const eth = ethereumReader(ethereumChain(process.env.ETH_NETWORK ?? "sepolia"), process.env.ETH_RPC_URL)
    const { anchor } = await readAnchor(eth, flags.anchor as Hex)
    if (!anchor) throw new Error("That transaction is not a ChainKiv anchor")
    const names = Object.keys((ens as ProberState | undefined)?.probers ?? {}).map((label) => `${label}.probers.${name}`)
    const release = { "arkiv.latestAnchor": flags.anchor, "arkiv.root": anchor.root, "arkiv.release": anchor.releaseNo, "arkiv.metaHash": anchor.metaHash }
    // After a handover this key may only write the release records, so --release sends nothing else.
    const records = flags.release ? release : {
      ...release, "arkiv.publisher": account.address, "arkiv.chainId": String(net.chain.id),
      ...(names.length ? { "arkiv.probers": names.join(",") } : {}),
    }
    print(await setRecords(process.env.ETH_RPC_URL, account, name, resolver, records))
  },

  /** Gives each prober a subname: a.probers.<name>. Records nothing on Arkiv and changes no existing ENS record. */
  async "ens-probers"() {
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const saved = await Bun.file(`${HOME}/ens.json`).json()
    if (!saved.name || !saved.resolver) throw new Error("Run ens-register first")
    const addresses = (process.env.CHAINKIV_PROBERS ?? "").split(",").map((p) => p.trim()).filter(Boolean)
    if (!addresses.length) throw new Error("Set CHAINKIV_PROBERS")
    const probers = addresses.map((address, i) => ({ label: String.fromCharCode(97 + i), address: address as Hex }))
    const save = (ens: ProberState) => Bun.write(`${HOME}/ens.json`, JSON.stringify({ ...saved, ens })).then(() => undefined)
    print(await setupProbers(process.env.ETH_RPC_URL, account, saved.name, saved.resolver, probers, saved.ens ?? {}, save, console.log))
    console.log("Now run ens-records --anchor <tx> to list them in arkiv.probers.")
  },

  /** Moves the name to a cold wallet or multisig, leaving this key only the records a release changes. */
  async "ens-handover"(flags) {
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const { name, resolver, ens } = await Bun.file(`${HOME}/ens.json`).json()
    if (!flags.to) throw new Error("Pass --to <address of the new owner>")
    // This cannot be undone from this key, so the name has to be typed out.
    if (flags.confirm !== name) throw new Error(`This gives up control of ${name}. Add --confirm ${name} once you hold the key for ${flags.to}.`)
    const registries = [ens?.nameRegistry, ens?.proberRegistry].filter(Boolean)
    await handOver(process.env.ETH_RPC_URL, account, name, resolver, registries, flags.to as Hex, RELEASE_KEYS, console.log)
  },

  async "swarm-stamp"(flags) {
    const bee = flags.bee ?? SWARM_BEE
    const days = Number(flags.days ?? 7)
    const { currentPrice } = (await (await fetch(`${bee}/chainstate`)).json()) as { currentPrice: string }
    const depth = 17
    const amount = BigInt(currentPrice) * BigInt(Math.ceil((days * 86_400) / 5))
    const cost = Number(amount * 2n ** BigInt(depth)) / 1e16
    if (!flags.confirm) return print({ days, depth, amount: amount.toString(), costXbzz: cost, next: "Add --confirm to buy" })
    const response = await fetch(`${bee}/stamps/${amount}/${depth}?label=${STAMP_LABEL}`, { method: "POST" })
    if (!response.ok) throw new Error(`The node refused: ${await response.text()}`)
    print({ ...(await response.json() as object), days, costXbzz: cost })
  },
  async "swarm-save"(flags) {
    const net = network()
    const account = keyFor("PUBLISHER_KEY", net)
    const reg = registry(net)
    const check = await reg.release()
    if (!check.anchor || !check.allLeaves) throw new Error("The latest release couldn't be read")
    const root = check.anchor.root
    const had = await reg.swarmCopy(root)
    if (had) return print({ ...had, already: true })
    const bee = flags.bee ?? SWARM_BEE
    const stamp = flags.stamp ?? (await chainrollStamp(bee))
    const body = encodeBundle(check.anchor, check.allLeaves, await reg.trust(), await reg.meta().catch(() => null))
    const name = `chainroll-release-${check.anchor.releaseNo}.json`
    const response = await fetch(`${bee}/bzz?name=${name}`, { method: "POST", headers: { "content-type": "application/json", "swarm-postage-batch-id": stamp, "swarm-deferred-upload": "false" }, body })
    if (!response.ok) throw new Error(`The node refused the upload: ${response.status} ${(await response.text()).slice(0, 120)}`)
    const { reference } = (await response.json()) as { reference: string }
    console.log(`Uploaded ${reference}, reading it back through the public gateway`)
    // Recorded only after a stranger's view of Swarm rebuilds the root.
    let seen = { ok: false, detail: "" }
    for (let i = 0; i < 24 && !seen.ok; i++) {
      seen = await checkCopy(reference, root)
      if (!seen.ok) await Bun.sleep(10_000)
    }
    if (!seen.ok) throw new Error(`Uploaded ${reference}, but it can't be read back yet: ${seen.detail}`)
    const values = { merkleRoot: str(root), releaseNo: u64(BigInt(check.anchor.releaseNo)), reference: str(reference), uploadedAt: u64(BigInt(Math.floor(Date.now() / 1000))) }
    await writer(net, account).executeBatch({ creates: [{ schema: SwarmCopy, values, expiration: ExpirationTime.fromDays(CORE_DAYS) }] })
    print({ reference, detail: seen.detail })
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
  import-chainlist [--commit sha] [--repo dir] [--dry-run]
  survey    Probe every listed RPC, read-only, no wallet needed
  release-meta [--survey file] [--out file]   Write the prober list and agreed first blocks for --meta
  probe     --tier 1|2|3 [--chains 1,8453] [--every seconds] [--region name] [--publisher address]
  verify    <chainId> | --all | --chainlist
  chain     <chainId>
  query     '<arkiv query>'
  doctor    Check network, wallets and the publisher lookup
  fund-probers --amount 1 [--from prober-a] [--dry-run]
  swarm-stamp --days 7 [--confirm]                Show the cost of a stamp, and buy it with --confirm
  swarm-save  [--stamp id] [--bee url]            Copy the latest release to Swarm and record it on Arkiv
  ens-register --name chainroll.eth [--dry-run]   Sepolia only
  ens-records --anchor <tx> [--release]           --release writes only what a hot key may
  ens-probers                                     Give each prober a subname
  ens-handover --to <address> --confirm <name>    Move the name to a cold wallet
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
