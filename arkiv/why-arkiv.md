# Why Arkiv

The chain list is a folder of JSON files on GitHub. That works for chain IDs and names, which rarely change. It does not
work for the questions below, which need live data, queries and a way to tell who wrote what.

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
