# CRDT outbox SQLite benchmark and fault plan

## Current automated evidence

| Gate | Test | Current result |
|---|---|---|
| Real sqlite-wasm SQL | `studio-crdt-outbox-sqlite.test.ts` | Structured enqueue/list/ACK/retry execute against `@sqlite.org/sqlite-wasm`, not a Map SQL emulator |
| Named VFS close/reopen | same test | Two pending requests and retry metadata survive close/reopen with deterministic sequence order |
| ACK atomicity | same test | Forced SQLite DELETE trigger failure rolls back both ACK and deletion |
| Corruption fail-closed | same test | Canonical payload corruption is rejected even when stored byte length is internally consistent |
| Duplicate identity safety | same test | Same update ID with a different payload aborts and leaves the original row intact |
| Bounded queue | same test | Lowered test limit rejects the next enqueue without evicting prior rows or the emergency copy |
| Writer ordering | same test and existing outbox tests | 128 interleaved writes are all retained in deterministic sequence order; replacement bindings remain serialized |
| Migration rollback | `studio-local-database.test.ts` | Failed v5 statement leaves `user_version=4`, no partial outbox table, existing v4 schema intact |
| Product retry wiring | `studio-crdt-room-binding.test.ts` | Retryable publication writes attempt/error/next-retry metadata before scheduling 300ms backoff |

This is correctness evidence. It is not a browser OPFS performance result.

## Required Chromium OPFS workload

Run the production Vite `/studio` bundle and the exact product outbox in a module Dedicated Worker
using the shared OPFS SAH-pool and `/studio-local-v12.db`.

1. Cold open and warm reopen of an empty, 8,193-entry and 65,536-entry scoped queue.
2. Enqueue 48 KiB raw-update equivalents until the 256 MiB canonical bound.
3. Ordered list, retry update, single ACK, 1,000 ACK batch and duplicate enqueue.
4. Two tabs/workers writing the same and different works; verify no lost rows and bounded busy time.
5. Terminate the worker before enqueue, during transaction, after commit, between publish and ACK,
   and during ACK delete; reopen and compare canonical queue digest.
6. Exhaust quota and revoke OPFS access; confirm explicit degraded status and no success label.
7. Corrupt each nullable retry field, payload byte count, JSON, sequence and ACK relationship.
8. Run 8h/24h reconnect and close/reopen soak with server duplicate receipts.

## Metrics

- cold-open and warm-open p50/p95/p99;
- enqueue, ordered-list, retry-update and ACK p50/p95/p99;
- lock wait/busy count under two writers;
- physical OPFS bytes for pending rows, indices and ACK tombstones;
- page and Worker peak memory only from a real browser measurement API, otherwise `null`;
- SQLite WASM/chunk bytes already present versus incremental outbox code bytes;
- emergency-only durations, capacity errors, corruption errors and recovery-lock transitions;
- zero console/page/Worker errors other than deliberately injected failures.

## CRDT/system release gates

The following are deliberately **not measured by the storage tests** and remain required:

- Yjs convergence after concurrent offline edits from at least two devices;
- stable server receipt dedupe after browser crash between publish ACK and local removal;
- server sequence/frontier recovery after network partition and account/work switching;
- physical Chromium/Safari/Firefox and Windows/macOS/Linux matrix;
- CSP blind comparison using the same collaboration task and source assets;
- 8h/24h collaboration soak with no silent queue loss or permanent retry hot loop.

No p50/p95/p99 or browser peak-memory claim may be published until a raw Chromium OPFS artifact is
committed. The current values are therefore recorded as **unmeasured**, not estimated.
