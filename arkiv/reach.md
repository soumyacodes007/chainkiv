# Reach

## The short answer

**Who uses or depends on this data today?** Nearly every tool that adds an EVM network. The numbers below were counted on
7 Nov 2026.

| Signal | Count | How to check |
|---|---|---|
| Code on GitHub calling `chainid.network/chains.json` | 1,284 results | [GitHub code search](https://github.com/search?q=%22chainid.network%2Fchains.json%22&type=code) |
| Code on GitHub calling `chains_mini.json` | 163 results | [GitHub code search](https://github.com/search?q=%22chainid.network%2Fchains_mini.json%22&type=code) |
| Code on GitHub naming `ethereum-lists/chains` | 4,808 results | [GitHub code search](https://github.com/search?q=%22ethereum-lists%2Fchains%22&type=code) |
| Downloads of the `eth-chainlist` npm package last month | 182,627 | [npm](https://www.npmjs.com/package/eth-chainlist) |
| Upstream stars and forks | 9,833 and 8,232 | [Repo](https://github.com/ethereum-lists/chains) |
| Chainlist stars and forks | 3,115 and 3,786 | [Repo](https://github.com/DefiLlama/chainlist) |
| Pull requests to the list, all time | 6,809 | [Pull requests](https://github.com/ethereum-lists/chains/pulls) |
| Merged since 1 Aug 2026 | 272 | Same |
| Open and waiting for review | 129 | Same |

Code search counts are GitHub's estimates, and they include forks and copies, so read them as scale, not as a count of projects.
We could not find public figures for Chainlist's visitors or for how many wallet users this reaches, so we don't claim any.

**The need is real, and it is measurable today.** `chainid.network/chains.json` still lists `rpc.blast.io` first for Blast, and
that name no longer resolves. Blast [announced its shutdown](https://www.theblock.co/news/business/2026-10-02-blast-ethereum-layer-2-shutting-down-417583)
in October. Across the list, about 1,800 networks list RPCs and none of them work. Every tool reading the file inherits this, and
fixing one RPC takes a pull request in a queue of 129.

**Who would use our copy after Mumbai, and for what?** The people below, because a flat file can't tell them which RPCs work today
or prove a record is unchanged.

| Who | What they would use it for | How they would do it today |
|---|---|---|
| Wallets adding a network | Offer only RPCs that pass checks, and warn when none do | One `healthyRpcs` call in `src/client.ts`, or an Arkiv query |
| Listing sites like Chainlist | Show signed health and a proof link beside each chain | Read the records from Arkiv with no API key |
| People adding a network by hand | Pick an RPC that works, and add it in one click | [The site](https://chainroll-flame.vercel.app) |
| RPC providers | See how their endpoints look from outside, in public | Search for their URL on the site, or query `chainkiv.rpcHealth` |
| The EthereumLists maintainers | Find dead RPCs, and take over signing by pointing the ENS name at their own key | The RPC health page, then `ens-handover` |
| Developers and agents | Ask "which L2s use ETH?" without downloading every file | One query, with no account |

**This is who we built it for, not who has agreed to use it.** No one has committed yet.

## Why switching is easy

A tool already reading `chains.json` doesn't have to change how it works.

- **Same format.** `toChainsJson()` in `src/client.ts` rebuilds the upstream file from Arkiv, so existing parsers keep working.
- **One extra call.** `healthyRpcs(chainId)` returns only RPCs that pass, fastest first.
- **No account.** Reads need no key, wallet or sign-up.

Try it now. This reads Base from Arkiv with no key:

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network/ -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('chainkiv.chain') AND chainId = u64(8453) AND \$owner = addr(0xb6d7BE32085f47D07dE996e2dA8F7664408fA304)\",{\"select\":{\"key\":true,\"owner\":false,\"creator\":false,\"createdAt\":false,\"updatedAt\":false,\"expiresAt\":false,\"creationFlags\":false,\"attributeSchema\":false,\"attributes\":{\"name\":true}},\"limit\":\"0x1\"}]}"
```

## How we'd reach them after Mumbai

None of this has happened yet.

1. Show the EthereumLists maintainers the dead RPCs, so they can remove them.
2. Publish `src/client.ts` to npm, so a wallet can add it in one line.
3. Ask to join the [Usages section](https://github.com/ethereum-lists/chains#usages) of the upstream README.
4. Add a third prober run by someone else, so the readings stop depending on one team.

## Coverage

Source: `ethereum-lists/chains` at commit `e17474286275730fb6b0490b1d7ea1c64a36ed9e`, the head of its main branch when
checked on 7 Nov 2026.

| Data | Records on Rabdi |
|---|---|
| Chains | 2,855 of 2,855 |
| RPCs from ethereum-lists | 4,219 |
| Explorers | 2,536 |
| RPC URLs from Chainlist, with tracking labels | 2,848 |

All 2,855 chains pass `chainkiv verify --all`. Details are in [data-quality.md](data-quality.md).

## Who depends on the list

These projects depend on the upstream list, not on our copy. None of them has adopted Chainroll.

Named in the [Usages section](https://github.com/ethereum-lists/chains#usages) of the upstream README:

| Kind | Projects |
|---|---|
| Wallets | WallETH, Trezor, Minerva Wallet |
| Explorers | Otterscan |
| Tools | MESC |
| Listing sites | chainid.network, chainlist.wtf, chainlist.org, Chainlink docs, dRPC Chainlist |
| Standards | EIP-155, EIP-3014, EIP-3770, EIP-4527 |

Checked in each project's own source on 7 Nov 2026, all reading `chainid.network/chains.json`, which is built from the
list:

| Project | File |
|---|---|
| MetaMask extension | [`shared/constants/network.ts`](https://github.com/MetaMask/metamask-extension/blob/main/shared/constants/network.ts) |
| Chainlist | [`pages/api/chain/[chain].js`](https://github.com/DefiLlama/chainlist/blob/main/pages/api/chain/%5Bchain%5D.js) |
| ethereum.org | [`src/scripts/update-chains.ts`](https://github.com/ethereum/ethereum-org-website/blob/dev/src/scripts/update-chains.ts) |

The upstream repo had 9,833 stars and 8,231 forks on 7 Nov 2026, and GitHub counted 2,190 contributors, including ones
with no GitHub account.

## Ways to use our copy

| Way | Needs |
|---|---|
| [The site](https://chainroll-flame.vercel.app) | A browser. It reads Arkiv and Ethereum directly, with no backend of ours |
| `bun run cli query "..."` | This repo, with no key or wallet |
| The client in `src/client.ts` | This repo. It is not published to npm yet |
