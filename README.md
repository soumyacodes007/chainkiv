# ChainKiv

The EthereumLists chain registry on Arkiv: queryable, checkable against a signed release, with live evidence for every
RPC and Chainlist's privacy labels beside it.

Built at ETHGlobal Mumbai. The plan is in [PRD.md](PRD.md). This is a work in progress.

## What it adds to a flat list

- **Queries:** find a chain by ID, short name, parent, currency or red flag, with no API key.
- **Proof:** check a record against the exact upstream file and a signed release.
- **Live RPC evidence:** see which listed RPCs answer correctly right now.
- **Privacy labels:** see what Chainlist reports about whether an RPC tracks you.

**In V1 the publisher is this team, not the EthereumLists maintainers.** The signature proves who published this copy
and what it contains. It does not mean the maintainers approved it.

## Requirements

- [Bun](https://bun.sh) 1.3 or later
- An access key from [hub.arkiv.network](https://hub.arkiv.network) for imports
- A funded Rabdi wallet for writes; reads need neither

## Quick start

```bash
bun install
cp .env.example .env.local
bun run cli doctor
```

Rebuild the release root for a commit, with no wallet:

```bash
bun run cli import --commit e17474286275730fb6b0490b1d7ea1c64a36ed9e --root-only
```

Test every listed RPC, read-only, with no wallet:

```bash
bun run cli survey
```

Query Rabdi:

```bash
bun run cli query "chainId = u64(8453) AND \$owner = addr(0xb6d7BE32085f47D07dE996e2dA8F7664408fA304)"
```

## Wallets on Rabdi

| Role | Address |
|---|---|
| Publisher | `0xb6d7BE32085f47D07dE996e2dA8F7664408fA304` |
| Prober A | `0xecDEfDB69daF7De91615adf1D7bb955AA0D5a521` |
| Prober B | `0x6eEAaa1835b82A8ecbF11BAa9c109FE009534d17` |
| Validator | `0x06B38cA11785e6b75B489F642683216a2eA55df3` |

## Data sources and licences

The code in this repo is under the [MIT licence](LICENSE). The data keeps the licence of its source.

| Data | Source | Licence | How we use it |
|---|---|---|---|
| Chain records, RPCs and explorers | [ethereum-lists/chains](https://github.com/ethereum-lists/chains) | [MIT](https://github.com/ethereum-lists/chains/blob/master/LICENSE), which allows republishing | Mirrored to Arkiv; the original file is kept byte for byte in `raw` |
| Extra RPCs, tracking labels and privacy statements | [DefiLlama/chainlist](https://github.com/DefiLlama/chainlist), the data behind [chainlist.org](https://chainlist.org) | [GPL-3.0](licenses/GPL-3.0.txt), which allows republishing with credit and the same licence | Split into one record per RPC and one per privacy statement |

**Credit:** the RPC tracking labels and privacy statements are the work of the DefiLlama Chainlist contributors and the
RPC providers who wrote them.

**The Chainlist data on Arkiv stays under GPL-3.0.** Every `chainkiv.rpcPrivacy` and `chainkiv.privacyPolicy` entity
records `source`, `sourceCommit` and `licence`. Our only change is the format: we split the list into separate records,
and the text of each statement is unchanged. Chainlist's data files are not in this repo, and none of its code is used:
`src/chainlist.ts` reads the file as plain data and never runs it.

**Tracking labels are reported, not checked.** They come from Chainlist and the providers. ChainKiv tests whether an RPC
answers correctly; it cannot test what a provider does with your requests.

## How we used AI

Claude Code wrote most of the code and docs from the team's PRD and decisions, and ran the tests and surveys. The team
chose the idea, reviewed the trust design, funded the wallets and made the outward-facing decisions.

## More

- [arkiv/schema.md](arkiv/schema.md): entities, owners and expiry
- [arkiv/data-quality.md](arkiv/data-quality.md): measured results
- [arkiv/friction.md](arkiv/friction.md): rough edges, with steps to reproduce
