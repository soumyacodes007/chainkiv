# ChainKiv on Arkiv: PRD

6 Nov 2026 · @Amlan · Working name changed from ChainRegistry to ChainKiv, the repo name.

## Summary

We put the EthereumLists chain registry (2,855 chains, 4,220 RPC URLs) on Arkiv as typed, queryable entities
that anyone can read without an API key, and make every record checkable against a publisher-signed release
root on Ethereum. RPCs move out of the core list into expiring extension records, each linked to live,
evidence-backed health stats published by independent probers.

**Pitch:** GitHub gives you a flat list you have to trust. We prove which git commit every record came from,
show who published it, and show whether each RPC passes live checks right now.

**Who signs:** in V1 the publisher is this team, and the screens say so. The design lets the EthereumLists
maintainers take over later by pointing the ENS name at their own key. They have not agreed to this yet.

| | V1 (this hackathon) | V2 (after Mumbai) |
|---|---|---|
| Source of truth | GitHub `ethereum-lists/chains`, synced on every commit | Radicle repo signed by maintainer delegates, GitHub retired |
| Query layer | Arkiv testnet Rabdi | Arkiv mainnet when it exists, same data, same root |
| Trust anchor | Release root + ENS on Ethereum (Sepolia while testing) | Same, signed by a maintainer multisig or delegate threshold |
| RPC health | Signed probe readings with chain ID, genesis hash and block hash evidence | More independent probers, provider domain claims at scale |
| Proposals | Permissionless proposal entities with automatic validation | Radicle patches as proposals, mirrored to Arkiv |
| Frontend | Search, chain page, RPC stats page, verify, proposals | Embeddable widgets, wallet integrations |

Everything in this document is V1 unless the section is marked V2. Radicle appears only in the V2 section.

## Changes after the trust review

| Change | Why |
|---|---|
| "Maintainer-signed" became "publisher-signed" for V1 | The V1 key is ours. Maintainer signing is the future plan, not a V1 fact |
| Merkle proofs moved from each chain record to a release manifest | Every upstream commit changes the root, so stored proofs would make almost every unchanged chain look outdated |
| Anchors point at the latest release through ENS | A reader needs a way to find the newest anchor without trusting an Arkiv node |
| Verify rebuilds every attribute from `raw` | Checking only `chainId` and `shortName` left the other attributes unprotected |
| The GitHub check is required and tests main-branch history | It is the real link to upstream, and GitHub can show fork commits under the parent repo |
| Prober readings are signed; the prober list and genesis hashes are covered by the anchor | Without this, a lying Arkiv node could fake health rows or add a prober |
| Blob ids come from git objects, not files on disk | Line-ending conversion changes the bytes on disk, so the root would differ by machine |
| Green RPCs say "passed checks", never "safe" | A malicious RPC can forward to a real node and pass every check |
| Quotes, names and whiteboard details were removed from this public file | Permission to publish them has not been given |

## Problem and evidence

The chain list most of Ethereum configures wallets from lives as JSON files on one company's platform, with RPC
URLs that nobody checks.

**What EthereumLists is.** `ethereum-lists/chains` (MIT) is one JSON file per chain, named
`eip155-<chainId>.json`, merged by maintainers through GitHub pull requests and aggregated into
`chainid.network/chains.json`. ethereum.org describes it as the canonical metadata list for EVM chains;
chainlist.org, chainid.network, Chainlink's docs and dRPC's chainlist build on it.

**The dataset today** (upstream commit `e174742`, 5 Nov 2026):

| Measure | Count |
|---|---|
| Chains | 2,855 |
| RPC URLs | 4,220 (599 WebSocket, 40 need an API key, 0 over 128 bytes) |
| Chains with no RPC | 198 |
| Explorers | 2,537 |
| Chains with a parent | 360 (336 L2, 24 shard) |
| Chains flagged `reusedChainId` | 32 |
| Status set | 173 active, 136 incubating, 133 deprecated, 2,413 blank |
| Icons | 1,324 (IPFS links) |

**Why the flat list fails.**

- RPC URLs churn monthly while the core (chain ID, name, currency) almost never changes, so RPC pull requests
  bury the core.
- Nothing checks that a listed RPC is up, on the right chain or current.
- Being listed is free promotion, so RPC entries attract self-promotion (Base alone lists 14 RPCs).
- A curated list makes a malicious RPC look endorsed, and anyone can copy the data elsewhere and claim it is the
  list.

**Demand signals.** The EthereumLists maintainer has publicly discussed moving the list off GitHub, and a Devcon
session explored the properties and open questions of such a move. An Arkiv team member told us the hard problem
is trust, suggested combining the registry with RPC probing, and pointed out that GitHub cannot show live
per-RPC stats. Names and quotes stay out of this file until those people agree.

## Goals, non-goals and success metrics

V1 succeeds when a judge can re-run our import, query any chain on Arkiv, click through to live RPC stats, and
verify a record against Ethereum in under five minutes.

### Goals (V1)

1. Mirror 100% of `ethereum-lists/chains` into Arkiv on Rabdi, re-synced within 15 minutes of every upstream commit.
2. Split records into core (chain identity) and extension (RPCs, explorers).
3. Make every core record verifiable: git provenance, a Merkle proof against a release root on Ethereum, and an
   ENS-named publisher.
4. Probe RPCs and publish expiring, signed, evidence-backed health readings, viewable one click from each RPC.
5. Accept permissionless proposals, validate them automatically, and keep spam out of what apps show.
6. Ship a frontend and a client library that read only from Arkiv.

### Non-goals (V1)

- Replacing GitHub or deciding EthereumLists governance; that is the maintainers' decision.
- Hosting the source repo on Radicle (V2).
- Running on Arkiv mainnet, which does not exist yet.
- Probing all 4,220 RPCs at high frequency before throughput and cost are measured.
- Token lists, 4byte signatures or other EthereumLists repos.

### Success metrics by judging criterion

| Criterion (25% each) | Metric | V1 target |
|---|---|---|
| Reach (`reach.md`) | Chains covered; named users or projects that depend on the list; people who tried our copy | 2,855 of 2,855; listing sites cited; at least 1 person who tried it, quoted with permission |
| Why Arkiv (`why-arkiv.md`) | Open registry questions answered with a runnable query | Every Arkiv-relevant question mapped to a feature and a query |
| Data quality (`data-quality.md`) | Sync lag; records whose hash verifies; health reading freshness | Under 15 min; 100%; newest reading under 15 min old for probed RPCs |
| Arkiv feedback (`friction.md`) | Reproducible issues with expected, actual and steps | At least 8, each with a command or query |

## Users and use cases

| User | What they need | V1 feature |
|---|---|---|
| Wallet and dApp developers | Correct chain metadata and working RPCs, without hardcoding or trusting a scraped copy | Client library: `getChain(8453)`, `healthyRpcs(8453)`, both with `verify()` |
| End users adding a network | "Is this the real chain, and does this RPC work?" | Chain page, RPC stats page, trust badges, add-to-wallet button |
| EthereumLists maintainers | Less RPC churn in reviews, spam kept out, a path off GitHub | Core/extension split, proposal validation, a handover path |
| RPC providers | A way to list and prove their endpoint without a pull request | Self-published RPC records plus a domain claim |
| Independent probers | Publish measurements others can check | Prober service and `rpcHealth` entities under their own wallet |

Core use cases:

1. Look up a chain by ID, short name or name prefix and see its verified core record.
2. List RPCs for a chain, filtered to ones passing checks on the correct chain, sorted by latency.
3. Open one RPC and see its uptime, latency by region, last block and who measured it.
4. Verify a record: commit, file hash, Merkle proof, Ethereum anchor, publisher ENS.
5. Propose a new chain or RPC without a GitHub account, and see it validated within minutes.
6. Find all L2s of a chain, all chains using a currency, or every red-flagged chain.

## System architecture

Three workers write to Arkiv, one of them also anchors to Ethereum, and every reader gets data from Arkiv and
checks it against Ethereum; there is no server of ours in the read path.

| Component | Runs where | Writes | Reads |
|---|---|---|---|
| Importer | GitHub Action or cron (publisher wallet) | `chain`, `rpc`, `explorer`, `release`, `manifest` on Arkiv; anchor on Ethereum | GitHub repo, Arkiv (for the diff) |
| Prober | Any machine (prober wallet); two in V1 | `rpcHealth`, `rpcStats`, `domainClaim` | Arkiv `rpc` list, the RPCs themselves |
| Validator | Same box as the importer (validator wallet) | `review` | `proposal`, `chain`, prober results |
| Web app | Static hosting | `proposal` from the user's wallet | Arkiv; Ethereum for ENS and the anchor |
| Client and CLI | npm and the user's machine | `proposal` (CLI) | Arkiv; Ethereum |

## Arkiv data model

Entity types are defined once as SDK schemas (`defineSchema`, `@arkiv-network/sdk` 1.0.1). The full list of
fields is in [arkiv/schema.md](arkiv/schema.md).

Arkiv limits we design around:

| Limit | Value | Our worst case |
|---|---|---|
| String value | 128 bytes | longest chain name 45 B, short name 38 B, explorer URL 106 B, RPC URL 110 B |
| Bytes value | 128 KiB | largest chain JSON under 2 KB; the manifest is split into chunks |
| Attributes per entity | 64 total, 32 indexed | `chain` uses about 19 indexed |
| Maximum lifetime | about 180 days at 2 s blocks; permanent expiry refused | core records expire in 90 days and are renewed by the sync |
| Expired entities purged | at most 10 per block (432,000 per day) | health readings are patched in place, not created per check |
| Block capacity | about 250 small entities per block on Rabdi | initial import of about 9,600 entities fits in minutes |
| Page size | 100 rows | the client pages by `$key` |

Chain IDs are `u64` everywhere (the largest is 2,716,446,429,837,001, beyond `i32`), so queries must write
`u64(8453)`.

| Schema | One per | Owner | Expiry | Purpose |
|---|---|---|---|---|
| `chain` (core) | chain | publisher | 90 d, renewed under 45 d left | Identity, derived attributes, original JSON in `raw` |
| `rpc` (extension) | RPC URL | publisher or provider | 30 d, renewed by sync | One listed endpoint |
| `explorer` (extension) | explorer | publisher | 30 d, renewed | One listed explorer |
| `rpcHealth` | RPC URL per prober | prober | 2 h, extended on each patch | Latest signed reading |
| `rpcStats` | RPC URL per prober | prober | 2 d, patched hourly | Uptime and latency percentiles |
| `release` | anchored release | publisher | 90 d | Commit, root, chain count, anchor reference |
| `manifest` | chunk of a release | publisher | 90 d | The release's leaves, so readers can rebuild the tree |
| `releaseMeta` | release | publisher | 90 d | Trusted prober addresses and genesis hashes, covered by the anchor |
| `proposal` | submission | anyone | 14 d | A proposed chain or RPC |
| `review` | validation of a proposal | validator or maintainer | 14 d | Verdict, kept separate because only an owner can patch an entity |
| `domainClaim` | RPC host | prober | 7 d | Provider proved control of the host |

Example queries (the README ships these as runnable commands):

```text
-- one chain
chainId = u64(8453) AND $owner = addr(0xPUBLISHER)

-- every L2 of Ethereum mainnet
parentChainId = u64(1) AND layer = str('L2') AND $owner = addr(0xPUBLISHER)

-- short-name search
shortName STARTSWITH str('arb') AND $owner = addr(0xPUBLISHER)

-- RPCs for Base passing checks, fastest first
chainId = u64(8453) AND up = true AND chainIdOk = true AND $owner = addr(0xPROBER) ORDER BY latencyMs:i32

-- chains whose ID was reused
reusedChainId = true AND $owner = addr(0xPUBLISHER)
```

## Trust model

The question to answer: is this the right data, and did the right publisher put it there?

| Question | Proof | Where it is checked |
|---|---|---|
| Is this exactly the upstream file? | `sourceBlob` = git blob id of `raw` | Locally |
| Is it part of the release? | Merkle proof of the leaf, computed from the manifest | Locally |
| Did the publisher sign that release? | The anchor transaction comes from the publisher address | Ethereum |
| Who is the publisher? | ENS text records name the publisher and the latest anchor | ENS on Ethereum |
| Is the commit really upstream? | The commit is in the history of `ethereum-lists/chains` main | GitHub or a clone |

**Git blob id.** `sha1("blob " + byteLength + "\0" + bytes)`, the same id `git hash-object` prints. Bytes are read
from git objects, never from a working copy.

**Merkle tree.** OpenZeppelin `StandardMerkleTree`. One leaf per chain:

```text
leaf = (uint64 chainId, string shortName, bytes20 sourceBlob)
```

The root depends only on the commit, so anyone can rebuild it. RPCs and explorers are not leaves, but imported ones
can be checked against the `rpc` and `explorers` arrays inside `raw`.

**Release manifest.** The leaves are stored in chunked `manifest` entities. A reader downloads them, rebuilds the
tree, and checks the root against the anchor. A chain that did not change keeps verifying against every new release
with no write at all, and the reader also learns the exact set of chains in the release.

**Anchor.** A zero-value transaction from the publisher to itself, with `chainkiv/1`, the release number, commit,
root, chain count and `metaHash` in its calldata. `metaHash` is the keccak hash of the `releaseMeta` content. At most
one anchor a day. Sepolia during development, one real mainnet anchor for the demo if the budget allows. EAS
attestations are a later option.

**ENS.** A name the publisher controls, with text records `arkiv.publisher` (address), `arkiv.chainId` (7794095) and
`arkiv.latestAnchor` (transaction hash). The name is ours for the hackathon; the handover moves it to the maintainers
or changes these records.

### Verification algorithm

1. **Publisher:** resolve ENS to the publisher and the latest anchor.
2. **Anchor:** read the transaction; require sender = publisher; decode the release.
3. **Manifest:** read it from Arkiv, rebuild the tree; require root and chain count to match the anchor.
4. **File:** recompute the git blob id of `raw`; require it to equal the manifest's blob for this chain.
5. **Attributes:** rebuild every attribute from `raw`; require them to match the entity.
6. **Proof:** compute the Merkle proof and check it against the anchored root.
7. **Upstream:** require the commit to be in the history of `ethereum-lists/chains` main.

All seven pass: "Verified, release N, commit abc123". A failure names the failing step. A record newer than the
latest anchor shows Pending anchor. A step that could not run says so and never counts as a pass.

### What this proves and what it does not

- **Proves:** the record is byte-identical to the file at an upstream commit, that the ENS-named publisher anchored
  that release, and that a changed or copied record fails.
- **Does not prove:** that the maintainers approved anything (V1 uses our key); that GitHub's content is right;
  that a query returned every RPC or health row; that a green RPC is honest on calls we did not test; that the
  publisher key is safe.
- **Trust in Arkiv nodes:** core records need none. Health rows need none for their content, because they are
  signed, but a node can still hide rows. Reading from two nodes and flagging disagreement reduces that risk.

## Anti-spam

Anyone can write to Arkiv, so spam can be written but is never shown or trusted: every read path filters by owner
and proof, and everything unverified expires.

| Spam | Defence | Where |
|---|---|---|
| Fake "official" chain record | Apps read only the ENS-named publisher and require a manifest match | Client library, frontend |
| Junk proposals | Shown only in a separate "unreviewed" area; expire after 14 days; validator posts `invalid` reviews | Validator, frontend |
| Proposal for a chain that does not exist | Must include an RPC that answers `eth_chainId` with the proposed ID | Validator |
| Squatting a chain ID or short name | Uniqueness enforced only among publisher records; collisions shown as a conflict list | Validator, frontend |
| Fake RPC records | Provider records count as "claimed" only after the prober finds the provider's address at `https://<host>/.well-known/arkiv.json` | Prober, frontend |
| Fake health readings | Only signed readings from probers in the anchored list count; disagreeing probers are flagged | Client library, frontend |
| Write floods | Every write pays for size and lifetime; short expiries bound what spam occupies | Arkiv protocol |

**Honest limits.** Testnet GLM is free, so the fee defence is weak on Rabdi today. Filtering on many trusted owners
needs repeated `OR` terms, so we use one query per prober and merge in the client. Both go into `friction.md`.

**Demo.** A script writes junk proposals, a fake chain-1 record and a fake "up" reading for a dead RPC. The frontend
shows none of them, and Verify fails on the fake record.

## Importer (sync worker)

One deterministic, re-runnable command turns any commit of `ethereum-lists/chains` into Arkiv entities and a release;
anyone running it at the same commit gets the same root.

```bash
chainkiv import --commit <sha|HEAD> --network rabdi --anchor sepolia|mainnet|none [--dry-run]
```

1. Fetch the repo at the commit and record the full SHA.
2. Read `_data/chains/*.json` from git objects, with each file's blob id.
3. Validate: required fields, `chainId` under 2^64, strings under 128 bytes. Invalid files are reported, not dropped.
4. Check uniqueness of `chainId` and `shortName`; duplicates are reported and flagged with an indexed `conflict`.
5. Derive attributes: `layer`, `parentChainId`, feature booleans, `reusedChainId`, `needsApiKey`, `protocol`.
6. Build the Merkle tree and manifest.
7. Diff against what the publisher owns on Arkiv: create new, patch changed, extend those nearing expiry, delete
   those removed upstream.
8. Write in `executeBatch` calls with retries and backoff; a rerun finishes an interrupted import because it diffs
   against Arkiv.
9. When anchoring: write the release, manifest and meta, send the anchor, then update ENS.
10. Print a report: counts, warnings, root, anchor transaction, elapsed time.

**Schedule.** A GitHub Action or cron polls upstream every 10 minutes. Anchoring is batched daily; Arkiv data updates
every run.

**Idempotency.** Running twice at one commit changes nothing the second time except expiry extensions. `--dry-run`
prints the diff and root without writing.

## Prober (proof of chain and RPC health)

The prober answers "is this RPC up, on the right chain, and current?" with evidence anyone can recheck.

One probe of one RPC (JSON-RPC, 5 s timeout per call):

1. `eth_chainId`: `chainIdOk` = equals the listed chain ID.
2. `eth_getBlockByNumber("0x0", false)`: genesis hash; `genesisOk` = equals the chain's agreed genesis.
3. `eth_getBlockByNumber("latest", false)`: block number, hash and timestamp.
4. `latencyMs` = median of the three round trips; `up` = all three answered.
5. `lagBlocks` = highest head seen across this chain's RPCs in the round minus this head.

URLs containing `${...}` are marked `needsApiKey` and not probed.

**Genesis consensus.** For each chain, the genesis hash returned by a majority of responding listed RPCs (at least 2)
becomes the agreed hash. Self-published provider RPCs do not vote. Many listed RPCs may share a backend, so this is a
strong hint, not a proof. An RPC returning a different genesis is shown red even if its chain ID matches.

**Evidence and its limits.** Each reading is signed by the prober and carries the block number and hash, so anyone
can check that the block exists. This does not prove the prober really reached that RPC: a dishonest prober could
copy a block from another RPC. A second prober or a Recheck is what catches that.

**Writing results.** One `rpcHealth` entity per (RPC URL, prober), created once, then patched each round with its
expiry pushed 2 hours out. If the prober stops, readings vanish within 2 hours. Hourly, the prober patches one
`rpcStats` entity per RPC with 24 h and 7 d uptime and latency percentiles from its own local history.

| Tier | Which RPCs | Interval | Approx. patches per day |
|---|---|---|---|
| 1 | Chains with status `active` plus the 50 most-used chains by our judgement | 10 min | about 300 RPCs × 144 = 43,000 |
| 2 | All other non-deprecated chains | 6 h | about 3,500 × 4 = 14,000 |
| 3 | Deprecated chains | daily | about 400 |

**Politeness.** At most 4 concurrent requests per host, a generic `User-Agent: chainkiv-prober/<version>` with a repo
link, no email, and back-off on HTTP 429.

**Domain claims.** Daily, for each provider-published `rpc`, fetch `https://<host>/.well-known/arkiv.json`; if it
lists the provider's address, write a `domainClaim`.

**Regions.** V1 runs one prober plus a teammate's laptop as a second region for the demo. Both are ours, so they
are not independent, and the docs say so.

## Frontend

A static web app with no backend of its own: every page reads Arkiv through the client library, and verification
reads Ethereum directly.

**Stack.** Vite + React + TypeScript, `@arkiv-network/sdk` public client for Rabdi, viem for ENS and the anchor.

| Page | What it shows |
|---|---|
| Search (home) | Search box, filters, result cards with trust badge and passing-RPC count |
| Chain `/chain/:id` | Core fields, Verified badge, RPC table with "Stats →", explorers, parent and child chains, Add to wallet, raw JSON |
| RPC stats `/rpc/:chainId/:urlHash` | The "one more click" page: uptime, latency per prober, last block with Recheck, chain and genesis checks, claim status, error if down |
| Verify (panel) | Right data and right publisher, with the seven steps and their links |
| Proposals `/proposals` | Unreviewed area, verdicts, conflict lists, Submit |
| Submit `/proposals/new` | Form or JSON paste, wallet connect, writes a `proposal` |
| Releases `/releases` | Number, commit, chain count, root, anchor link, sync lag |
| About and status | Freshness, prober list, how trust works, example queries |

**Add to wallet.** Calls `wallet_addEthereumChain` with only RPCs that passed checks, are not API-keyed, ordered by
latency; disabled with a reason when none qualify.

| Badge | Meaning |
|---|---|
| Verified | All seven steps pass on the latest anchored release |
| Pending anchor | Newer than the latest anchor |
| Unverified | Not publisher-owned or a check failed; shown only with a warning |
| RPC green, amber, red | Passed checks from at least 2 probers; passed from 1 or slow; down, wrong chain ID or wrong genesis |
| Claimed | Provider proved control of the RPC domain |
| Signed by demo publisher | Shown on Verify in V1, so nobody mistakes the signature for a maintainer's |

**States.** Loading skeletons; empty results with "Propose this chain"; Arkiv unreachable: banner plus last cached data
with its age; stale health (newest reading over 30 min): grey dots, not green; Ethereum unreachable: Verify says which
steps could not run.

## Client library and CLI

```ts
const reg = createRegistry({ arkiv, ethereum, ens: "<publisher ENS name>" })

await reg.getChain(8453)
await reg.findChains({ parentChainId: 1, layer: "L2" })
await reg.healthyRpcs(8453, { minProbers: 2, maxLatencyMs: 500 })
await reg.rpcStats(8453, "https://mainnet.base.org/")
await reg.verify(chain)        // { ok, release, steps: [...] }
await reg.latestRelease()
await reg.toChainsJson()       // upstream file format
```

| Command | Purpose |
|---|---|
| `chainkiv import` | The importer |
| `chainkiv probe` | Run the prober once or as a daemon |
| `chainkiv verify <chainId>` | Run the seven checks and print each result |
| `chainkiv verify --all` | Verify every chain and compare the count with the release |
| `chainkiv query '<query>'` | Run a raw Arkiv query |
| `chainkiv propose <file.json>` | Write a proposal |
| `chainkiv doctor` | Check access key, balances, Ethereum RPC and ENS records |
| `chainkiv spam-demo` | Write the anti-spam demo records |

## Edge cases

GitHub stays the source of truth in V1, nothing is silently dropped, and anything uncertain is shown as uncertain
rather than green.

| # | Area | Case | How we handle it |
|---|---|---|---|
| 1 | Import | A chain's file is renamed or its `chainId` changes | Keyed by `chainId`: old deleted, new created, both reported |
| 2 | Import | A chain is removed upstream | Its entities are deleted; the new release excludes it |
| 3 | Import | Two files share a `chainId` or `shortName` | Both imported with `conflict = true` and reported |
| 4 | Import | Malformed JSON in one upstream file | The chain keeps its last good version; warning in the report |
| 5 | Import | JSON reformatted upstream | Blob id changes, so the record is patched |
| 6 | Import | A string over 128 bytes (none today) | Indexed copy truncated at a UTF-8 boundary; full value stays in `raw` |
| 7 | Import | Upstream history rewritten | New release from the new head; step 7 reports a vanished commit |
| 8 | Import | GitHub unreachable | Retry; if it still fails no release is made and Arkiv keeps serving the last one |
| 9 | Write | Batch fails midway | The next run diffs against Arkiv and finishes |
| 10 | Write | Expiry too long | Read the error, retry with a shorter expiry, log it |
| 11 | Write | Public RPC rate limit | Access key, back-off, batches |
| 12 | Write | Testnet reset | Re-run the import; same commit gives the same root |
| 13 | Write | Sync stops and core records near expiry | Renewal under 45 days left; `doctor` warns at 30 |
| 14 | Write | Purge backlog | Health is patched in place, so few entities expire at once |
| 15 | Read | A node omits matching records | The manifest gives the exact set; a mismatch is shown and the client can switch node |
| 16 | Read | Records change during a paged read | Page by `$key` |
| 17 | Read | Old blocks unavailable | History is not read from old blocks |
| 18 | Read | Access key in a public frontend | Use the public endpoint plus caching; a read-only proxy only if needed |
| 19 | Read | No substring search | Exact and prefix queries on Arkiv; fuzzy search on the cached list |
| 20 | Read | Too many trusted owners for one query | One query per prober, merged in the client |
| 21 | Trust | Publisher key compromised | ENS moves to a new key and a new release is anchored |
| 22 | Trust | A node serves an older release | ENS names the latest anchor, so the old manifest fails |
| 23 | Trust | Anchor not yet mined | Release shows Pending anchor; retried |
| 24 | Trust | ENS unreachable | Verification says it could not run; it never passes without it |
| 25 | Trust | Someone mirrors the data under their own wallet | Fails the publisher check; shown as an unverified mirror |
| 26 | Probe | Right chain ID but a fork or copycat | Genesis mismatch turns it red |
| 27 | Probe | A testnet resets | Majority genesis switches; chain flagged |
| 28 | Probe | Fewer than two RPCs answer | `genesisOk` unknown, never green |
| 29 | Probe | HTTP 429 | Recorded as rate-limited, not down; back-off |
| 30 | Probe | URL needs an API key | Not probed; labelled; excluded from Add to wallet |
| 31 | Probe | WebSocket-only RPC | Probed over WSS with the same calls |
| 32 | Probe | Prober's own network fails | Red needs 2 probers; one prober gives amber |
| 33 | Probe | Prober stops | Readings expire after 2 hours; dots turn grey |
| 34 | Probe | Prober lies | Other probers and Recheck can contradict it; disagreement is flagged |
| 35 | Probe | Prober clock is wrong | Compared with block time; readings over 5 minutes off are flagged |
| 36 | Probe | Hostile RPC sends huge responses | 1 MB cap and 5 s timeout per call |
| 37 | Probe | Record points at an internal address | Private, loopback and link-local ranges refused after DNS resolution |
| 38 | Proposals | Proposal for an existing chain ID | Validator posts `invalid` |
| 39 | Proposals | Flood from one address | Expire in 14 days; unreviewed area only |
| 40 | Proposals | Accepted proposal while GitHub is the source | Advisory: the validator generates a pull request |

## V1 build phases

Owners: A = importer and trust, B = prober, C = frontend and docs. Hours are estimates.

| Phase | Owner | Hours | Build | Exit test |
|---|---|---|---|---|
| 0. Validate | All | 2 | Ask the Arkiv booth; get an access key and funded wallet; time 100 test writes; probe max lifetime | 100 writes succeed |
| 1. Core import | A | 6 | Schemas, importer, example queries | 2,855 chains queryable; second run writes nothing new |
| 2. Extensions and trust | A | 6 | `rpc`, `explorer`, manifest, release, anchor, ENS, `verify` | `verify --all` passes; a changed entity fails |
| 3. Prober | B | 6 | Probe calls, genesis consensus, signed `rpcHealth`, `rpcStats`, tier 1, second prober | Every tier-1 RPC has a fresh reading from 2 probers |
| 4. Frontend core | C | 8 | Search, chain page, RPC stats, Verify, Add to wallet | A fresh browser goes search → chain → stats → Verify, all from Arkiv |
| 5. Proposals and anti-spam | A + C | 4 | Proposal submit, validator, `spam-demo` | Spam never appears in main views |
| 6. Anchor, docs, polish | All | 8 | One real anchor, tiers 2–3, README, `/arkiv/*.md`, fresh-machine run, backup video | Someone who did not build it runs the README in under 5 minutes |

**Cut order:** domain claims, tiers 2–3, releases page, mainnet ENS (keep Sepolia), proposals. **Never cut:** phases
1–4, the Sepolia anchor and verify, the README and `/arkiv/*.md`.

`friction.md` is written as issues appear, not at the end.

## V2: Radicle and later work

V2 moves the source of truth off GitHub onto Radicle with no change to the Arkiv data or the trust model, because a
Radicle repo is plain git and produces the same commit and blob ids.

Radicle is a peer-to-peer forge built on git. A repo's identity document names its delegates, whose keys may commit to
the main branch, and canonical reference rules can require a threshold of delegates.

1. Mirror `ethereum-lists/chains` into a Radicle repo; keep syncing from GitHub until the maintainers' deadline.
2. The importer gains `--source rad:<repo id>`.
3. Verify step 7 checks the commit is canonical under the delegates' threshold rule.
4. Radicle patches replace Arkiv proposal entities, mirrored to Arkiv so they stay queryable.
5. Delegates or a multisig sign the release; ENS names the Radicle repo ID too.
6. Use Radicle 1.7 or later.

Other later work: Arkiv mainnet, more independent probers, provider self-service, a network-picker widget and wallet
integrations, other EthereumLists datasets after a licence check.

## Hackathon deliverables

- [ ] New public repo built at ETHGlobal Mumbai, with an open-source licence (MIT)
- [ ] README links the data licence and confirms republishing is allowed
- [ ] Not Sourcify data
- [ ] Import script in the repo and re-runnable
- [ ] Writes to Arkiv's current testnet (Rabdi, chain ID 7794095) with `@arkiv-network/sdk`
- [ ] A feature people use reads from Arkiv
- [ ] README lists the publisher, prober and validator wallets and one query to run
- [ ] `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `data-quality.md`
- [ ] README section on how we used AI

**Demo script (3 minutes)**

1. "This is the list wallets configure chains from: a flat list on GitHub, with RPCs nobody checks." Show Base's 14 RPCs.
2. Share the probe result: what share of listed RPCs were dead or on the wrong chain.
3. Search "base"; open Base: Verified badge, RPC table with live dots.
4. One more click: uptime, latency from two probers, last block hash, Recheck.
5. Verify: right data, right publisher, ending at the anchor on Etherscan, labelled "Signed by demo publisher".
6. Run `chainkiv spam-demo`: the fake chain-1 record never appears and Verify fails on it.
7. Close: "Today we sign it. The maintainers can take over through ENS, with no change to the apps."

## Risks and open questions

| Risk | Effect | Mitigation |
|---|---|---|
| The core/extension split is not what the maintainer wants | Part of the design misses | Ask in phase 0; the split is easy to merge back |
| Another team builds the same mirror | Weaker entry | Live RPC evidence and verification are the differentiators; demo them first |
| Rabdi limits lower than expected | Slow import, fewer probes | Measure in phase 0; shrink tier 1; batch writes |
| Testnet reset | Data gone | Import is re-runnable and gives the same root |
| A false "down" label on a real provider | Trust lost | Red needs 2 probers; evidence shown |
| Overclaiming endorsement | Trust lost with judges | Quote nobody without permission; screens say the publisher is ours |

Questions for the Arkiv booth:

- [ ] Does the core/extension split match what the maintainer wants?
- [ ] Rabdi's real maximum lifetime and write limits
- [ ] Is a permanent expiry allowed? The API spec and tokenomics doc disagree
- [ ] Is there an Arkiv mainnet date we can cite?
- [ ] Who has agreed to be quoted?
- [ ] Would Arkiv or the maintainers try the prototype during the hackathon?

## Sources

- [ethereum-lists/chains](https://github.com/ethereum-lists/chains), MIT; counts from our clone at the 5 Nov 2026 commit
- [ethereum.org](https://ethereum.org)
- Arkiv node repo docs: `api-spec.md`, `genesis-spec.md`, `tokenomics_v1.md`, `query-language-conformance.md`
- `@arkiv-network/sdk` 1.0.1 README and chain definitions
- [OpenZeppelin merkle-tree](https://github.com/OpenZeppelin/merkle-tree)
- Conversations at ETHGlobal Mumbai, not cleared for quotation
