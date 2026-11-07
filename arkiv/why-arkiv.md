# Why Arkiv

The chain list is a folder of JSON files on GitHub. That works for chain IDs and names, which rarely change. It does not
work for the questions below, which need live data, queries and a way to tell who wrote what.

## Why this is better than what exists

Wallets and sites already use a chain list. What they can't do is check it. Chainroll keeps the same data and adds proof
that it is unchanged, evidence that its RPCs work, and a way to query both.

| Question | `ethereum-lists/chains` on GitHub | `chainid.network/chains.json` | Chainlist | Chainroll |
|---|---|---|---|---|
| Can I query it? | Read the files | Download one file | Search on its site | Typed queries from any browser, with no key |
| Does this RPC work now? | Not part of the list | Not part of the file | Reports latency and privacy | Readings signed by two probers, on Arkiv |
| Is it on the right chain, and is its head current? | Not part of the list | Not part of the file | Not checked by us | Chain ID, first block, and head age |
| Who wrote this record? | Git history | A built file | The site | The entity's owner, set by the chain, with the publisher named on ENS |
| Can I prove this copy wasn't changed? | Trust GitHub | Trust the host | Trust the site | Seven checks in your browser, ending at a signature on Ethereum |
| What if the host goes away? | Clones survive | Gone | Gone | Rebuild from Arkiv, or from the copy on Swarm, and check it against the same root |
| Can I see past RPC health? | No | No | Not checked by us | Signed snapshots on Swarm |
| Can I propose without GitHub? | No | No | No | Yes, from a wallet. The automatic validator isn't running yet |

### The difference, measured

- **The list goes stale, and only live checks show it.** Blast [announced its shutdown](https://www.theblock.co/news/business/2026-10-02-blast-ethereum-layer-2-shutting-down-417583)
  on 2 Oct 2026. On 7 Nov, 0 of its 21 RPCs passed on Chainroll. Its official `rpc.blast.io` no longer resolves in public DNS,
  and the RPCs that still answer were serving a head about 12 hours old.
- **Answering is not the same as working.** Prober A's first round with head age found 23 RPCs with old heads that had
  counted as healthy, including one over 2,000 hours behind.
- **Tampering is visible.** Changing one character of Base's record in a test browser turned the record red and failed the
  check, while the rest of the path stayed green.
- **Every chain checks out.** All 2,855 chains pass `verify --all` against a release anchored on Sepolia.
- **Nothing needs our server.** The site is static files, and your browser reads Arkiv, Ethereum and Swarm directly.

We don't replace the upstream list. It stays the source of truth, and in this version the publisher is our team, not its
maintainers. Chainroll is a checked copy with live evidence beside it.

Sources for the other columns: the [upstream repo](https://github.com/ethereum-lists/chains) and a
[description of Chainlist](https://checker.gitcoin.co/public/application/7bZe3Bp77a/show). "Not checked by us" means we did
not confirm it either way.

## Why not something else?

Chainroll needs five things at once:

1. **Query it:** ask by chain ID, by parent, by prefix or by health, with no server of ours.
2. **Change it constantly:** two probers update 958 RPCs every 20 minutes, which is about 138,000 writes a day.
3. **Let it expire:** a reading from a stopped prober has to disappear by itself, so it can't leave a false green.
4. **Know who wrote it:** anyone can write, and readers can still pick out the publisher's and the probers' records.
5. **Read it from a browser:** a static site has to work with no backend and no login.

| Option | Query it | Constant change | Expiry | Who wrote it | Browser with no backend | What it does better than Arkiv |
|---|---|---|---|---|---|---|
| **Arkiv** | Yes, typed and indexed | Yes, patched in place | Yes, built in | Yes, the chain sets `$owner` | Yes | See below for its limits |
| **GitHub** | No, you read files | No, 138,000 writes a day isn't what a repo is for | No | Yes, by commit | Files only, with 60 API calls an hour per network | Review and history. It stays the source of truth |
| **Postgres** | Yes, the best of any here | Yes | With a cleanup job | Only what our server says | No, it needs an API | Speed, joins and full-text search |
| **IPFS** | No, by hash only | No, every change is a new hash | No, files stay while pinned | No, a hash says what, not who | Depends on public gateways | Moving one file by its content |
| **Swarm** | No, by reference only | No, not for this | Paid time, by stamp | No | Yes, by reference | Keeping files. We use it for that |
| **A smart contract** | Only what the contract exposes | Costly at this volume | Must be built | Yes | Yes, through an RPC | Strong guarantees for small, important data |
| **An indexer (The Graph)** | Yes | Yes | Must be built | Only as far as its source shows | Through a hosted service | Reading chain history that already exists |

### Why not GitHub?

GitHub is where the list is reviewed, and it should stay there. It is a poor place for live data:

- **It can't say what works.** On 7 Nov 2026 the Blast file still fed the list while 0 of its 21 RPCs passed. A file only changes
  when someone sends a pull request.
- **It can't be queried.** "Every L2 of Ethereum" means downloading every file, because there is no query.
- **It has a low limit.** Without a login, GitHub's API allows 60 calls an hour per network, and we ran through that repeatedly
  while building.
- **One company hosts it.** A bad day at GitHub takes the one copy most tools read.

### Why not Postgres?

Postgres would be faster, and it answers richer queries than Arkiv does. It fails on trust, not on speed.

A database shows what its operator says. Readers would have to trust our server, and we would have to run accounts, moderation
and an API, then keep them running. Chainroll's site is static files because nothing needs to go through us. With Postgres, every
promise on this page would become "trust us".

### Why not IPFS?

IPFS finds a file by its hash, which suits a file that never changes. A health reading changes every 20 minutes, so its hash
would too, and nothing could ask "which RPCs pass?" across files.

We tested it for chain logos on 7 Nov 2026, using the IPFS links in the upstream list. Three public gateways refused all 40
requests with HTTP 429. A fourth served 23 of 40, at about 6 seconds each.

### Why we still use Ethereum and Swarm

Arkiv isn't the right place for everything, so each job goes where it fits:

| Job | Where | Why |
|---|---|---|
| Live, queryable records | Arkiv | The five needs above |
| Who to trust, and the signed root | Ethereum and ENS | Hard to rewrite, and outside Arkiv, so Arkiv can't vouch for itself |
| Copies and probe history | Swarm | Files that outlive a testnet, and prove themselves |
| The source of truth | GitHub | Where maintainers already review changes |

## Questions the list cannot answer today

Every query here ran on Rabdi on 7 Nov 2026 with no access key and no wallet. Counts are from that run, and health counts
change with each round. Rabdi returns at most 100 records per page, so `100+` means at least a full page.

Run them all:

```bash
bun run --conditions browser spike/why-arkiv-queries.ts
```

Run one:

```bash
bun run cli query "arkiv.schema = str('chainkiv.chain') AND parentChainId = u64(1) AND \$owner = addr(0xb6d7BE32085f47D07dE996e2dA8F7664408fA304)"
```

### Finding chains

| Question | Arkiv feature | Query | Result |
|---|---|---|---|
| Which chain has ID 8453? | Typed `u64` attributes, because the largest chain ID does not fit in 32 bits | `chainId = u64(8453)` | 1 |
| Which chains are L2s of Ethereum? | Indexed attributes, so there is no file scan | `parentChainId = u64(1)` | 100+ |
| Which short names start with `base`? | Prefix search | `shortName STARTSWITH str('base')` | 4 |
| Which chains use ETH? | Indexed attributes | `nativeSymbol = str('ETH')` | 100+ |
| Which chains reuse another chain's ID? | Boolean attributes | `reusedChainId = true` | 32 |

Each query also has `arkiv.schema = str('chainkiv.chain')` and the publisher's `$owner` filter.

### Checking RPCs

| Question | Arkiv feature | Query | Result |
|---|---|---|---|
| Which RPCs are listed for Base? | One record per RPC, so RPC changes never touch the chain record | `chainId = u64(8453)` on `chainkiv.rpc` | 42 |
| Which Ethereum RPCs pass right now? | Readings patched in place, with an owner per prober | `chainId = u64(1) AND up = true AND chainIdOk = true` on `chainkiv.rpcHealth` | 39 from Prober A, 39 from Prober B |
| Which Ethereum RPCs are over 10 blocks behind? | Numeric comparison | `chainId = u64(1) AND up = true AND lagBlocks > 10` | 0 |
| Which probed RPCs answer for the wrong chain? | Two indexed booleans together | `up = true AND chainIdOk = false` | 0 |
| Which Ethereum RPCs does Chainlist report as not tracking? | Queryable beside the RPC, with the source and licence on each record | `chainId = u64(1) AND tracking = str('none')` on `chainkiv.rpcPrivacy` | 26 |

Health queries filter on one prober's `$owner`. Tracking labels are what Chainlist reports, and we have not checked them.
The wrong-chain query covers the 958 RPCs probed every round. The full survey found 23 such RPCs among all 4,169 tested.

### Knowing who wrote it

| Question | Arkiv feature | Query | Result |
|---|---|---|---|
| Which release is signed, and at what commit? | Entities tied to the wallet that wrote them | `$owner` on `chainkiv.release` | 1 |
| Does a stranger's chain 1 show up? | `$owner` is set by the chain, and a writer cannot fake it | `chainId = u64(1)` with a stranger's `$owner` | 0 |
| What has anyone proposed? | Anyone with a wallet can write, with no GitHub account | `arkiv.schema = str('chainkiv.proposal')` | 0 so far |

## What each Arkiv feature does for us

| Feature | What it does here | What we would need without it |
|---|---|---|
| Owner on every entity | Anyone can write, and apps still show only the publisher's and probers' records | Accounts and moderation on a server we run |
| Expiry | A prober that stops loses its readings within 2 hours, so a dead prober cannot leave a stale green. Junk proposals expire in 14 days | A cleanup job, and trust that it runs |
| Patching in place | One health record per RPC and prober, instead of a new record every round | A growing table to prune |
| Indexed, typed attributes | Every question above is one query | Our own search server |
| Reads open to browsers | The [site](https://chainroll-flame.vercel.app) is static files. Your browser reads Arkiv and Ethereum directly, and nothing passes through a server of ours | An API that we host, and that users must trust |

GitHub cannot do these. A file can't expire, a pull request can't be queried, and a commit every 20 minutes for 958 RPCs is
not what a repo is for.

## What Arkiv does not solve

| Question | Why not | What we do instead |
|---|---|---|
| Is this copy the real list? | Arkiv shows who wrote a record, not whether to trust them | ENS names the publisher, a signed release is anchored on Sepolia, and every chain is checked against the upstream file |
| Is a passing RPC safe? | A malicious RPC can forward to a real node and pass every check | We say "passed checks", never "safe" |
| Does an RPC track me? | Nothing on chain can test what a provider does with a request | We show what Chainlist reports, labelled as reported |
| Did the maintainers approve this? | That is their decision. In this version the publisher is our team | The site says "Signed by demo publisher" |
| Can a node hide a record? | An Arkiv node can leave out rows, though it can't forge them | `verify --all` catches a missing chain. Missing health rows only look like no data |

The upstream GitHub repo stays the source of truth. Arkiv is a checked copy with live data beside it.

## What it cost us

Rabdi's limits shaped the design: 100 records per page, 20 records per batch, and a small no-key query budget. A browser
cannot hold an access key, so the site reads a static copy of the list when it matches the signed release, then reads only
signed readings and the pages a visitor opens. Details are in [friction.md](friction.md).
