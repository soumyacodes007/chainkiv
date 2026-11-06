# Data quality

Everything here was measured. Anything not measured yet is listed at the end.

Source: `ethereum-lists/chains` at commit `e17474286275730fb6b0490b1d7ea1c64a36ed9e` (5 Nov 2026).

## Import

| Check | Result |
|---|---|
| Chain files read | 2,855 of 2,855, no warnings |
| Unique RPC records | 4,219 (4,220 listed, 1 repeated inside a chain's file) |
| Unique explorer records | 2,536 |
| Same root from two clones with different line-ending settings | Yes: `0x7b0b0d24…8b9ebc`, though the files on disk differ in size |
| Second import at the same commit | 0 creates, 0 patches, 0 deletes |

## Verification

Run on a private `arkiv-reth` v1.0.1 chain with the full data. The anchor was on that chain and the publisher came
from local settings, so **ENS and a Sepolia anchor are not covered yet**. The GitHub main-branch check was real.

| Check | Result |
|---|---|
| Chains verified | 2,855 of 2,855, none missing |
| Changed attribute | Caught |
| Changed file with a swapped RPC | Caught |
| Fake chain 1 from another wallet | Not shown; apps still read the publisher's record |
| Another wallet claiming to be the publisher | Caught |

Reproduce: `spike/tamper-test.ts`.

## RPC survey

One read-only survey of every listed RPC on 6 Nov 2026, from one location in Mumbai, over venue internet. Each RPC got
three read calls with 5 s timeouts, and failures were tried once more. Probing paused while this machine was offline.
A failure here means the RPC did not answer us at that time, not that it is dead for everyone.

| Result | RPCs | Share of 4,169 tested |
|---|---|---|
| Passed | 1,393 | 33.4% |
| Did not answer correctly | 2,612 | 62.7% |
| Latest block over an hour old | 135 | 3.2% |
| Wrong chain ID | 23 | 0.6% |
| Different genesis from the agreed one | 3 | 0.1% |
| Rate-limited | 3 | 0.1% |

Not tested: 40 URLs need an API key, and 10 were refused because they point at a private address or an unsupported
scheme.

| Why RPCs did not answer | RPCs |
|---|---|
| Name does not resolve | 1,302 |
| Timed out | 460 |
| HTTP error | 449 |
| Connection failed | 224 |
| TLS failure | 119 |
| RPC error | 37 |
| Bad response | 21 |

Of the 2,647 chains with an RPC we could test, **1,815 had none that passed**. Base had 7 of 13 tested RPCs pass, and
Ethereum had 15 of 19.

**How far to trust this.** An earlier survey on this day was thrown away because this machine lost its connection, and a
second one counted pruned nodes as down. As a spot check, 35 of 40 random name failures also had no record on public
DNS. A second location has not been surveyed yet. Genesis agreement was only possible for 201 chains, because it needs
two hosts to agree. 172 working RPCs did not answer for block 0, so their genesis is unknown.

Reproduce: `chainkiv survey`, then `spike/survey-report.ts`.

## Not measured yet

- The full import on Rabdi, which is still running
- Sync lag from an upstream commit to Arkiv
- Freshness of health readings on Rabdi
- A survey from a second location
- ENS and the Sepolia anchor
