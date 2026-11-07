# Arkiv and Swarm

Arkiv answers queries about live records. Swarm keeps files. Chainroll uses each for what it does best, and Arkiv holds
the pointer that makes the Swarm copy findable.

| Stored on | What | Why there |
|---|---|---|
| Arkiv | Chains, RPCs and the latest signed reading for each RPC | Indexed and queryable, with expiry |
| Arkiv | `chainkiv.swarmCopy` and `chainkiv.swarmArchive`, which hold Swarm references | Anyone can find a copy by querying the publisher's records |
| Swarm | A bundle for each release | Outlives Arkiv's testnet and GitHub |
| Swarm | Snapshots of every signed probe reading | Arkiv keeps only the latest reading for each RPC, so this is the history |
| Ethereum | The release root and the ENS records | The trust anchor |

## Copies prove themselves

Neither Swarm nor this site has to be trusted.

- **Release bundle:** it holds the leaves of the release, so anyone can rebuild the Merkle root and compare it with the root
  signed on Ethereum. A changed file gives a different root.
- **Probe snapshot:** it keeps each prober's signature, so anyone can confirm every reading came from a prober named on ENS.
  An edited reading no longer recovers to that prober.

The Releases and RPC health pages run these checks in the browser, reading the copy through a public Swarm gateway.

## How a copy is written

1. Build the bundle or snapshot.
2. Upload it through a Bee node.
3. Read it back through a public gateway and verify it.
4. Only then record the reference on Arkiv, from the publisher's wallet.

`bun run cli swarm-save` does this for the latest release, and `bun run cli swarm-archive` for a probe snapshot. The tools
only spend a stamp labelled `chainroll`. References are not encrypted, because anyone has to be able to read and check them.

## Live references

| What | Reference |
|---|---|
| Release 1 | [`02dfe3be…f943f65b`](https://api.gateway.ethswarm.org/bzz/02dfe3be9574facc326ca63a62bede88a8a8a06acd5bbe223db05714f943f65b/) |
| Probe snapshot, 7 Nov 2026 | [`bb1c98a0…abb2692d`](https://api.gateway.ethswarm.org/bzz/bb1c98a038775d7ebe17f33942777ea7f3898c8653ceeddbbc3b0578abb2692d/) |

## Limits

- The current stamp lasts about seven days. A copy can disappear from Swarm after its stamp expires, unless the stamp is
  topped up. The reference on Arkiv would then point at nothing, and the check says so.
- Saving needs the publisher's key and a Bee node, so it runs on the publisher's machine. Snapshots aren't automatic yet.
  A deployed site can only read and check copies.
