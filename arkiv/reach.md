# Reach

How much of the list we cover, who depends on that list, and who has tried our copy.

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

## People who tried it

**None recorded yet, so the target of at least one person is not met.** A person goes here only once they have tried it
themselves and agreed to be quoted.

| Who | What they tried | What they said | Date |
|---|---|---|---|

## Not measured

- Site visits: the site has no analytics.
- Use by any wallet, explorer or listing site: none uses it today.
