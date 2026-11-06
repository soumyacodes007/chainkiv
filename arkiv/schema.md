# Arkiv schema

Every entity is written through a named SDK schema (`src/schemas.ts`), which tags it with an indexed `arkiv.schema`
attribute such as `chainkiv.chain`. `*` marks an indexed attribute.

Apps read only entities owned by the publisher or by a prober named in the signed release. Anyone else can write
entities with the same schema, and they are ignored.

| Schema | Owner | Expiry | Attributes |
|---|---|---|---|
| `chainkiv.chain` | Publisher | 90 days, renewed under 45 | `chainId*` u64, `shortName*`, `name*`, `chainFamily*`, `nativeSymbol*` str, `nativeDecimals*` i32, `networkId*` u64, `status*`, `layer*` str, `parentChainId*` u64 (optional), `reusedChainId*`, `conflict*`, `eip155*`, `eip1559*`, `eip4844*`, `eip7702*` bool, `sourceBlob*` str, `sourceCommit` str, `raw` bytes |
| `chainkiv.rpc` | Publisher, or a provider later | 30 days, renewed under 15 | `chainId*` u64, `url*`, `protocol*` str, `needsApiKey*` bool, `origin*` str |
| `chainkiv.explorer` | Publisher | 30 days, renewed under 15 | `chainId*` u64, `name*`, `standard*`, `url` str |
| `chainkiv.rpcHealth` | Prober | 2 hours, extended every patch | `chainId*` u64, `url*`, `region*` str, `up*`, `chainIdOk*` bool, `genesis*` str (`ok`, `bad`, `unknown`), `latencyMs*`, `lagBlocks*` i32, `checkedAt*` u64, `blockNumber` u64, `blockHash`, `genesisSeen`, `error`, `proberVersion` str, `sig` bytes |
| `chainkiv.rpcStats` | Prober | 2 days, patched hourly | `chainId*` u64, `url*` str, `uptime24h*`, `uptime7d*` dec, `p50Ms*`, `p95Ms`, `samples24h` i32 |
| `chainkiv.release` | Publisher | 90 days | `releaseNo*` u64, `commit*`, `merkleRoot*` str, `chainCount` u64, `metaHash`, `anchorNetwork`, `anchorTx` str |
| `chainkiv.manifest` | Publisher | 90 days | `merkleRoot*` str, `part*`, `parts` i32, `data` bytes |
| `chainkiv.releaseMeta` | Publisher | 90 days | `metaHash*` str, `data` bytes |
| `chainkiv.proposal` | Anyone | 14 days | `kind*` str, `targetChainId*` u64, `shortName*`, `note` str, `raw` bytes |
| `chainkiv.review` | Validator | 14 days | `proposalKey*` key, `verdict*` str, `targetChainId*` u64, `reasons` str |

## Fields people query by

| Question | Fields |
|---|---|
| One chain | `chainId`, `$owner` |
| L2s of a chain | `parentChainId`, `layer`, `$owner` |
| Search by short name | `shortName` with `STARTSWITH` |
| Chains using a currency | `nativeSymbol` |
| Red-flagged chains | `reusedChainId` |
| RPCs of a chain | `chainId` on `chainkiv.rpc` |
| RPCs passing checks | `chainId`, `up`, `chainIdOk`, `$owner`, sorted by `latencyMs` |

## Why these expiries

- Chain identity rarely changes, so it lasts 90 days and only a stalled sync lets it lapse.
- RPC lists churn, so they expire sooner.
- A health reading is only useful while fresh. If a prober stops, its readings disappear within 2 hours instead of
  showing a stale green.
- One health entity is patched per RPC and prober, because Arkiv purges at most 10 expired entities per block.
