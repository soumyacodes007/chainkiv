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

## On Rabdi

| Check | Result |
|---|---|
| Records written | 9,610: 2,855 chains, 4,219 RPCs, 2,536 explorers |
| Second run at the same commit | All 9,610 unchanged, so nothing was duplicated |
| Cost | About 2.6 tGLM |
| Time | About 46 minutes for the last 2,015 chains and all RPCs and explorers, at 20 records per transaction |

## Chainlist

From `DefiLlama/chainlist` at commit `759ad92f70043da439b935a68371cec45f87a05c` (5 Nov 2026), GPL-3.0.

| Check | Result |
|---|---|
| Unique RPC URLs | 2,848 across 973 chains |
| Reported as not tracking | 788 |
| Reported as limited tracking | 1,035 |
| Reported as tracking | 202 |
| No label | 823 |
| Privacy statements | 158 |
| Already in ethereum-lists | 717 |
| New URLs | 2,131 |
| URLs for chains not in ethereum-lists | 29 |

The labels are reported by Chainlist and the providers. We have not checked them, and the new URLs were not part of
the RPC survey below.

## Verification

Run on Rabdi on 6 Nov 2026, starting from `chainroll.eth` on Sepolia, the release anchor on Sepolia and the GitHub main
branch.

| Check | Result |
|---|---|
| Publisher read from `chainroll.eth` | Pass |
| Release anchor sent by the publisher | Pass, [transaction](https://sepolia.etherscan.io/tx/0xbbaa879e6a2b78456dcb22444f966d9331d52d62c0e0629152d671c481d8a323) |
| Manifest rebuilds the signed root | Pass, 2,855 chains |
| Commit is on the upstream main branch | Pass |
| Chains verified | 2,855 of 2,855, none missing |
| Chainlist rows matching the signed hash | 2,848 of 2,848 |

The Chainlist check failed on its first run: it found 2,858 rows against 2,848 signed, because 10 records had been
written twice. The ethereum-lists RPCs had 20 extra copies in the same way. We have not confirmed why, though a batch
retried after a network failure is the likely cause. A rerun removed them and changed nothing else.

The tampering tests below ran on a private `arkiv-reth` v1.0.1 chain, not on Rabdi.

| Tamper test | Result |
|---|---|
| Changed attribute | Caught |
| Changed file with a swapped RPC | Caught |
| Fake chain 1 from another wallet | Not shown; apps still read the publisher's record |
| Another wallet claiming to be the publisher | Caught |

Reproduce: `spike/tamper-test.ts`, `chainkiv verify --all`, `chainkiv verify --chainlist`.

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
DNS. Genesis agreement was only possible for 201 chains, because it needs
two hosts to agree. 172 working RPCs did not answer for block 0, so their genesis is unknown.

Reproduce: `chainkiv survey`, then `spike/survey-report.ts`.

## Second survey location

The same survey ran on Railway in US West (`sfo`) on 6 Nov 2026, at the same commit.

| Result | Mumbai | Railway US West |
|---|---|---|
| Answered with a live chain | 1,393 | 1,364 |
| Did not answer correctly | 2,612 | 2,611 |
| Latest block over an hour old | 135 | 143 |
| Wrong chain ID | 23 | 23 |
| Different genesis from the agreed one | 3 | 2 |
| Rate-limited | 3 | 24 |
| Name does not resolve | 1,302 | 1,292 |

The two counts of RPCs that did not answer differ by one, from two continents and two kinds of network. That points to a
real problem with the list, not to one bad connection. Only the totals were kept from the Railway run, so we cannot say
that the same RPCs failed in both.

The rules changed between the runs. Railway's 1,364 is 569 that passed every check plus 795 that answered but whose
genesis could not be checked. Mumbai's 1,393 used the older rule, which counted both groups as passed.

## Live probing on Rabdi

Prober A ran test rounds on 6 Nov 2026 for Ethereum and Base only, from one location in Mumbai, over venue internet.
These 110 RPCs include Chainlist's URLs.

| Check | Result |
|---|---|
| Readings on Rabdi with a valid prober signature | 110 of 110 |
| Passed in the last two rounds | 45 and 44 of 110 |
| Passed in the last round, by chain | Ethereum 27 of 69, Base 17 of 41 |
| Main failures in the last round | 28 timed out, 16 rate-limited, 5 HTTP 403 |
| Cost of the first round | 0.033 tGLM |
| Cost of a repeat round | About 0.016 tGLM |

The first round passed 59, and a later one only 19. The 19 came from a bug: our 64 KB response limit was smaller than
Ethereum's latest blocks, which measured 88 to 104 KB, so every Ethereum RPC failed. The limit is now 1 MB. The drop
from 59 to about 45 is not explained yet. Rate limits from running rounds back to back are the likely cause, but this
has not been confirmed.

The 6 Nov survey above is barely affected: one RPC hit the old limit.

Both probers then moved to Railway, in two regions, for the 958 RPCs of the normal tier.

| Prober | Region | RPCs up in a full round | Round time |
|---|---|---|---|
| A | Southeast Asia (`asia-southeast1`) | 465 of 958 | 225 s |
| B | US West (`sfo`) | 464 of 958 | 219 s |
| A, earlier, from the Mumbai venue | Mumbai | 326 to 435 of 958 | 473 to 784 s |

The two Railway regions agree closely, and both found more RPCs up than the venue connection, which also varied between
rounds. So venue internet understated these numbers. Data centre addresses have their own bias, because some providers
block them.

Read through the SDK with both probers trusted, 32 Ethereum RPCs and 12 Base RPCs passed from both regions.

## Not measured yet

- Sync lag from an upstream commit to Arkiv
- Health readings over hours
- Whether the same RPCs failed in both survey locations
