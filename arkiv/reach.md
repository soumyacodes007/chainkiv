# Reach

## The short answer

**Who uses or depends on this data today?** Almost every EVM tool that adds a network. MetaMask, Chainlist and ethereum.org all
read `chainid.network/chains.json`, which is built from this list, and the upstream repo has 9,833 stars and 2,190 contributors.
Those users depend on the upstream list. None of them uses our copy yet.

**Who would use our copy after Mumbai, and for what?** The people below, because a flat file can't tell them which RPCs work
today or prove a record is unchanged.

| Who | What they would use it for | How they would do it today |
|---|---|---|
| Wallets adding a network | Offer only RPCs that pass checks, and warn when none do | One `healthyRpcs` call in `src/client.ts`, or an Arkiv query |
| Listing sites like Chainlist | Show signed health and a proof link beside each chain | Read the records from Arkiv with no API key |
| People adding a network by hand | Pick an RPC that works, and add it in one click | [The site](https://chainroll-flame.vercel.app) |
| RPC providers | See how their endpoints look from outside, in public | Search for their URL on the site, or query `chainkiv.rpcHealth` |
| The EthereumLists maintainers | Find dead RPCs, and take over signing by pointing the ENS name at their own key | The RPC health page, then `ens-handover` |
| Developers and agents | Ask "which L2s use ETH?" without downloading every file | One query, with no account |

**This is who we built it for, not who has agreed to use it.** No one has committed yet, and we have not spoken to these teams.
Our first step after Mumbai is to show the maintainers the list of dead RPCs, because 1,800 networks with none working is a
problem they can act on.

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
