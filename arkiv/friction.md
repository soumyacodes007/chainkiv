# Arkiv friction log

What we hit while building on Arkiv. Every entry says what we expected, what happened, and how to reproduce it. Slow query
shapes are not recorded here; they go to Arkiv privately.

Versions unless an entry says otherwise: `@arkiv-network/sdk` 1.0.1, `viem` 2.57.16, Bun 1.3.14, on Rabdi or a private
`arkiv-reth` v1.0.1 `--dev` chain. Entries 4 to 8 were first seen on Tiramisu with SDK 0.8.1, so check them on your version.

## 1. A batch that is too large fails with no reason

- **Expected:** an error saying the batch exceeded a size or gas limit, and what that limit is.
- **What happened:** `executeBatch` with 60 entities of about 1.5 KB failed with `Transaction failed: Execution error
  without revert data`. Batches of 40 succeeded. A real import also failed at 40 entities, probably because some chain
  files are larger. Nothing in the error points at the size of the batch.
- **Why it matters:** a bulk importer has to find a safe size by trial and error, and a batch that fails looks the same as
  any other failed transaction.
- **Reproduce:** `ARKIV_NETWORK=local bun run --conditions browser spike/limits.ts` on a private `--dev` chain.
- **Suggestion:** return the limit that was hit, and let clients read it, or estimate the batch before sending.
- **Our workaround:** batches of 20.

## 2. Release data has to go one part per transaction

- **Expected:** a batch holding two manifest parts (100 KB and 58 KB) to fit, because each is under the 128 KiB limit.
- **What happened:** the batch failed with the same `Execution error without revert data`. Each part alone succeeded, up
  to 128 KB. So the value limit and the transaction limit are different, and only the first is documented where we looked.
- **Reproduce:** put two 100 KB `bytes` values in one `executeBatch` on a private `--dev` chain.
- **Our workaround:** one transaction per part, written before the release entity, so a rerun can fill any gap.

## 3. Browsers can't hold a key, and the no-key budget is small

- **Expected:** a site with no access key can load a few pages, and the error says when to try again.
- **What happened:** CORS is open, so a static site can read Arkiv directly, which is good. But a key in browser code is
  public, so a site has to use the anonymous budget. After two or three page loads from one network on 7 Nov 2026,
  `arkiv_query` returned HTTP 429 `ANON_COST_LIMITED`, while `eth_blockNumber` still answered. The headers do give the
  reset: `RateLimit: limit=10000, remaining=0, reset=156` and `Retry-After: 156`. The JSON body does not, and through the
  SDK and viem all we saw was `HTTP request failed`. Our own site made this worse at first, by reading each chain's health
  with its own queries.
- **Why it matters:** every static site on Arkiv lives on this budget, and people on one network may share it. We do not
  know the window, or what a query costs without a key.
- **Reproduce:** with no access key, send `arkiv_query` calls from one IP until refused, then read the response headers.
- **Suggestion:** put the reset time in the error body, publish the budget and window, and offer a read-only or
  origin-restricted key that is safe in a browser.
- **Our workaround:** a visit went from over 2,000 requests to about 40, by reading all readings in pages and skipping the
  full list when it matches the signed release. The Verify page waits and tries again when it is limited.

## 4. A rate-limited call can hang for most of an hour

- **Expected:** a typed error, raised at once, with the reset time.
- **What happened:** viem's `http()` transport retries 3 times by default and honours `Retry-After`, even with a timeout
  set. When a budget ran out, Arkiv answered 429 with `Retry-After: 3217`, so one call waited close to an hour. A raw call
  to the same method returned the 429 straight away. Nothing errored and nothing was logged, and a long-running process
  built the documented way sat 2.5 hours behind the chain before anyone noticed.
- **Why it matters:** any indexer, prober or bot freezes silently when its budget runs out, and looks healthy until someone
  checks its progress.
- **Reproduce:** exhaust a budget, then time a `select(...)` query through a client with the default `http(url)`. Compare it
  with a raw `fetch` of `arkiv_query`.
- **Suggestion:** a `QuotaExceededError` with the reset time, or SDK clients that don't retry a 429 by default.
- **Our workaround:** every client uses `http(url, { retryCount: 0, timeout: 30_000 })` (`src/arkiv.ts`).

## 5. An exhausted access key gives no reset time

- **Expected:** a `Retry-After` or a reset header, and a documented quota size and window per key.
- **What happened:** every `arkiv_query` returned `HTTP 429 {"error":"QUOTA_EXCEEDED","message":"quota exhausted"}` with
  `Arkiv-Quota-Used-Percent: 100`, and no reset time. Through viem the first line of the error is only `HTTP request
  failed.`, with the reason further down in `details`.
- **Why it matters:** a prober or publisher that shares a key with test runs stops, with no way to know when it comes back.
- **Reproduce:** use one key until queries fail, then `curl -D -` any `arkiv_query` with that key.
- **Suggestion:** send the reset time, and document the quota.

## 6. A bare number in a range query silently matches nothing on a `u64`

- **Expected:** a match, or an error saying the types don't match.
- **What happened:** on an attribute written as `u64(n)`, `lte("attr", Number(n + 1000))` returned 0 results and no error.
  `lte("attr", u64(n + 1000))` returned the entity. The SDK's docs do say bare numbers default to `i32`, but the failure is
  silent.
- **Why it matters:** chain IDs and block numbers are `u64` here, and one missed wrapper looks exactly like "no results".
- **Reproduce:** create an entity with a `u64` attribute, then compare both queries.
- **Suggestion:** a type-mismatch error from the node, or an SDK warning for untagged numbers in range operators.
- **Our workaround:** every compared number goes through `u64(...)`.

## 7. A query right after a write can still show the state before it

- **Expected:** once a write resolves, a query at the current head reflects it.
- **What happened:** after an awaited `deleteEntity`, a list still held the entity, and was correct about a second later.
  It happens the other way too: a list right after `executeBatch` created 3 entities showed 1 of 3.
- **Why it matters:** a tool that re-reads straight after writing can write twice. Ours duplicated records until it stopped
  trusting an immediate re-read.
- **Reproduce:** delete or create entities, then query at once, in a loop.
- **Suggestion:** resolve writes only once the indexed state includes them, or return the block the write landed in.
- **Our workaround:** after a failed write, the importer waits, then replans from a fresh read (`withReplan`).

## 8. Queries return no transaction hash

- **Expected:** a selectable system field for the transaction that wrote an entity.
- **What happened:** a query returns the block (`createdAt`, `updatedAt`) but not the transaction or log index. To link a
  result to its transaction on the explorer, we needed a second lookup per record.
- **Why it matters:** "show me the proof of this record" is a natural thing for a site on Arkiv to do. Two entities written
  in one batch also can't be ordered from a query alone.
- **Reproduce:** select all system fields on any entity. No transaction hash comes back.
- **Suggestion:** expose the transaction hash and log index as selectable system attributes.
- **Our workaround:** `eth_getLogs` on the block with the entity key as a topic (see 9).

## 9. `eth_getLogs` fails now and then with an internal storage error

- **Expected:** one block's logs for one entity key, which is the cheapest way to find the transaction behind a record.
- **What happened:** on Rabdi on 7 Nov 2026, the same call on the same block sometimes returned the log and sometimes
  `-32603 golemdb segment_range_of(transactions): NotImplemented`. In one run it failed for three of four records in a row,
  and one of those records was in the same block as a record that worked. We did not count how often it happens.
- **Why it matters:** an app that treats the error as "no logs" shows a record with no transaction. Ours did at first.
- **Reproduce:** send `eth_getLogs` with `fromBlock` and `toBlock` set to one block and `topics: [null, <entityKey>]`,
  repeated for several records.
- **Our workaround:** retry, then fall back to the block's transactions and their receipts, which never failed in 28
  lookups. That costs several reads instead of one, which matters on the no-key budget.

## 10. Expired entities leave queries long before they leave the node

- **Expected:** a way to see how many expired entities are still waiting to be purged.
- **What happened:** 300 entities expired together on 2 s blocks. The purge took 30 consecutive blocks at exactly 10 per
  block (blocks 85 to 114). `arkiv_query` already returned a count of 0 in block 85, with 290 entities still to purge.
  `$expiresAt <= u64(block)` also returned 0, and no metric on `--metrics` names purging.
- **Why it matters:** operators cannot see the backlog through queries. About 250 small entities fit in a block
  (`docs/tokenomics_v1.md`), and only 10 can be purged from one. It is also why our health readings are patched in place.
- **Reproduce:** on a private `--dev` chain, create 300 entities with one expiry, then count them with `arkiv_query` while
  watching the purge.
- **Suggestion:** expose the backlog size and the last skipped purge as a metric or an `arkiv_*` method. A failed selection
  is logged only at `debug` (`skip pruning for payload`), so it should be counted too.

## 11. A query cursor stops working as soon as a new block arrives

- **Expected:** to page through a result set with `cursor`, as the API spec describes.
- **What happened:** on a default node, a cursor used after the next block fails with `-32005 cursor belongs to a different
  query, block or select`. Passing the first page's `atBlock` fails with `-32006 state for this block is not retained`. So
  a page-through has to finish within one block.
- **Why it matters:** this is intermittent and depends on timing. It worked in short tests, then failed partway through a
  crash drill on 500 ms blocks.
- **Reproduce:** run `arkiv_query` with `limit` below the match count, wait for a block, then send the returned `cursor`.
  Then try again with `atBlock` set to the first response's `blockNumber`.
- **Suggestion:** say this in the API spec, and either keep a few recent blocks by default or let a cursor fall back to
  keyset paging.
- **Our workaround:** we page by `$key` instead (`readAll` in `src/arkiv.ts`).

## 12. The store file never shrinks, so a purge looks like it freed nothing

- **Expected:** GolemDB's size to fall after a purge, or a way to read how much of it is reusable.
- **What happened:** after each round of 6,000 entities was purged, `du` on `/data/golemdb` went up, not down. The next
  round then grew the store by only about 1 MB, against about 50 MB for the first. So the space is reused, but nothing says
  how much is free. `Store::stats()` ([golemdb#61](https://github.com/Arkiv-Network/golemdb/pull/61)) has a `size` in use,
  but we found no way to read it from outside the node.
- **Reproduce:** on a private `--dev` chain, create and expire 6,000 entities a few times, and run `du` after each round.
- **Suggestion:** expose bytes in use and bytes reusable as metrics. Operators watching file size will misjudge their disk
  after every large purge.

## 13. The SDK's lifetime check assumes a 2 s block time

- **Expected:** `ExpirationTime.fromSeconds(19)` to round, or to use the chain's block time.
- **What happened:** it throws `a lifetime must be a multiple of the 2s block time`, including on a chain with 500 ms blocks.
  The error does suggest `fromBlocks`, which works.
- **Reproduce:** call `ExpirationTime.fromSeconds(19)` in a create.

## 14. A page limit above 100 is refused, and the limit cannot be read

- **Expected:** a way to discover the node's limits before hitting them.
- **What happened:** `limit: 0xc8` fails with `limit 200 exceeds the node maximum of 100`. Only trying it shows the value.
  This matches [golemdb#89](https://github.com/Arkiv-Network/golemdb/issues/89).
- **Reproduce:** send `arkiv_query` with `limit: "0xc8"`.

## What went smoothly

| Tested | Result |
|---|---|
| Too-long lifetime | Clear error before sending: 200 days is refused, naming the chain's maximum of 7,884,000 blocks (about 182 days). 180 days works |
| Large chain IDs | `u64` holds the largest chain ID, 2,716,446,429,837,001 |
| `&&` in a query | `symbol operators (&& \|\| ~) were removed — use AND, OR, STARTSWITH` said exactly what to change, with the position |
| Patching and extending in one `executeBatch` | One transaction, which is how probers renew a reading |
| Reads from a browser | Open CORS, so a static site needs no backend |
