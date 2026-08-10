# VRM creative SQLite benchmark and verification plan

## Automated evidence implemented now

The focused Vitest suite opens `openStudioLocalDatabase({ vfs: "memory" })`, which initializes the
installed real `@sqlite.org/sqlite-wasm` runtime. It verifies:

- exact roundtrip of all three namespaces;
- create/update/delete complete-snapshot behavior;
- namespace isolation inside `studio-local-v12.db`;
- byte-canonical re-serialization;
- duplicate, malformed, future, unknown-field and pretty-printed/noncanonical row rejection;
- count and byte admission before write;
- invocation-ordered overlapping writes;
- explicit OPFS/SQLite unavailability with no product browser-KV downgrade;
- product source contracts for load/save/delete wiring and prohibited old-key reads;
- pose-material UI hydration, rapid-write serialization and visible memory-only recovery state.
- calibration canonical roundtrip, malformed/future/non-finite rejection, save→clear ordering,
  generation-fenced product hydration and explicit current-tab status after write failure.

No latency numbers are claimed from unit-test runtime because memory VFS and Node process timing are
not representative of Chromium OPFS.

## Required browser OPFS benchmark

Run in production Chromium with the same `@sqlite.org/sqlite-wasm` pin and a Dedicated Worker where
supported. Record raw JSON under `tests/benchmarks/results/` for each workload:

| Workload | Iterations | Required metrics |
| --- | ---: | --- |
| 256 maximum-detail custom poses | 120 save + 120 load | cold open, p50/p95/p99, physical DB bytes, peak worker/WASM memory |
| 100 maximum 2 MiB full states, bounded by 16 MiB aggregate | 60 save + 60 load | p50/p95/p99, close/reopen SHA-256, peak memory |
| 64 maximum-detail pose materials | 120 save + 120 load | p50/p95/p99, close/reopen canonical equality |
| Tracking calibration save/load/clear | 1,000 alternating operations | p50/p95/p99, final absence, stale-save resurrection count, main-thread long tasks |
| Alternating pose/full/material writes | 1,000 operations | ordering, starvation, main-thread long tasks, final digest |

## Fault matrix

- terminate the worker before, during and after `kvSet`;
- quota exhaustion and storage eviction pressure;
- close/reopen after each fault and verify previous-or-next complete canonical row;
- malformed row, missing row, duplicate ID and future version;
- two tabs writing the same namespace, with an explicit conflict result rather than last-writer UX
  pretending to merge;
- unmount during hydration and during each queued write;
- 8h and 24h alternating save/load/delete soak.

## Promotion gates

- No partial or silently repaired malformed library.
- Close/reopen bytes decode to the exact expected canonical payload.
- No automatic read of pre-V12 keys.
- No UI success copy after a rejected durable write.
- No stale hydration or stale write completion changes React state.
- Memory-only changes remain visible and explicitly ephemeral.

## Current status

Real sqlite-wasm functionality and product wiring are tested. Actual Chromium OPFS p50/p95/p99,
large-payload peak memory, multi-tab behavior and soak remain quarantined and must not be reported as
completed.
