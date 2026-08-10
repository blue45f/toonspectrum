# CRDT recovery vault SQLite benchmark and fault plan

## Current automated correctness evidence

| Gate | Test | Current result |
|---|---|---|
| Real sqlite-wasm schema and repository | `studio-crdt-recovery-vault-sqlite.test.ts` | Marker/chunk/manifest operations run against the official WASM SQLite memory VFS |
| Named VFS close/reopen | same test | 257 ordered requests, three chunks, marker metadata, and vault identity survive close/reopen |
| Manifest-last fault ordering | same test | Forced manifest INSERT failure leaves one marker and one orphan chunk; no manifest is exportable and reopen fails closed |
| Canonical corruption | same test | Replaced chunk JSON with internally matching byte length raises a typed corruption error |
| Degraded durability | same test | Failed durable marker commit rejects with `durability: "degraded"`; memory remains same-page only |
| Bounded no-eviction write | same test | Lowered one-row limit rejects the second row and retains the first row unchanged |
| v6 migration rollback | `studio-local-database.test.ts` | Invalid second v6 statement restores `user_version=5`, removes the partial table, and preserves the v5 outbox row |
| Domain ordering/chunk completeness | `studio-crdt-recovery-vault.test.ts` | Deduplication, manifest/chunk completeness, large frontier assembly, export marking, and corrupt-row locking pass |
| Product authority boundary | `studio-crdt-recovery-vault-sqlite-product-boundary.test.ts` | Factory uses shared database/v6 capability; vault source contains no localStorage or IndexedDB path |

These are correctness and recovery-boundary results, not browser OPFS performance measurements.

## Required Chromium OPFS workload

Run the production collaboration product with the shared OPFS SAH-pool and
`/studio-local-v12.db` in a real Chromium module Worker.

1. Cold open and warm reopen with 0, 1, 1,001, and 100,000 scoped recovery rows.
2. Preserve frontiers at 1, 128, 129, 4,097, and the 512 MiB scoped capacity boundary.
3. Record the permanent marker, terminate before the first chunk, between chunks, before the
   manifest, after the manifest, and during export-status replacement; reopen after every point.
4. Force quota exhaustion, denied OPFS, missing SyncAccessHandle, `SQLITE_BUSY`, and full SAH-pool;
   verify no browser-KV write and an explicit degraded/recovery-locked product state.
5. Run two tabs/workers against the same scope/work and different works. Interleave marker, chunk,
   manifest, list, and export writes; verify no lost committed rows and bounded lock wait.
6. Corrupt every column independently: scope, work, key, kind, payload JSON, byte count, update
   request, chunk index/count, manifest count/status, and timestamps.
7. Exercise 8h and 24h collaboration sessions with permanent server rejection near pagehide,
   worker termination, browser crash, and reopen.
8. Confirm the former IndexedDB/localStorage keys are neither read nor copied, including profiles
   that still contain legacy data.

## Metrics

- SQLite/OPFS cold-open and warm-open p50/p95/p99;
- marker, chunk, manifest, scoped-list, row-get, and export-status p50/p95/p99;
- lock wait duration, busy retries, failed transactions, and reopen recovery duration;
- physical OPFS bytes for table, index, WAL/journal, and SAH-pool metadata;
- Worker and page peak memory from a real browser measurement API, otherwise `null`;
- rows/frontier, bytes/frontier, chunk count, and total recovery payload bytes;
- explicit degraded-duration and recovery-lock-duration counters;
- zero localStorage/IndexedDB operations attributable to the product recovery vault.

## Release gates

- No partial frontier is returned or marked exportable.
- Any scoped malformed row locks recovery; no valid subset is returned.
- A durable marker commit failure is visible in product status and keeps outbox cleanup at risk.
- Capacity failure evicts zero existing rows.
- Independent writers lose zero committed keys.
- Product boot performs zero legacy browser-KV recovery reads.
- No latency or peak-memory number is published until raw browser artifacts are retained.
- Yjs multi-device convergence and server receipt deduplication pass their separate collaboration
  suites; SQLite recovery tests do not claim those properties.

## Real Chromium OPFS result (2026-08-10)

Reproduction command from the repository root:

```bash
pnpm exec tsx tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser.ts
pnpm exec vitest run tests/visual/crdt-recovery-sqlite-opfs-browser-contract.test.ts
```

Raw evidence is retained in
`tests/benchmarks/results/crdt-recovery-sqlite-opfs-browser.json`. The harness builds a dedicated
production Vite bundle, serves it with COOP `same-origin`, COEP `require-corp`, CORP `same-origin`,
and a `worker-src 'self'`/`wasm-unsafe-eval` CSP, then runs Chromium 140.0.7339.186 against a fresh
origin. It imports the actual product `createStudioCrdtRecoveryVault()` factory and shared local
database runtime. The constructor receipt proves `toonspectrum-studio-sqlite` plus
`/studio-local-v12.db`; memory DB constructor calls were zero.

### Exact recovery receipts

| Receipt | Measured result |
|---|---:|
| Structured rows | 95 (63 chunks, 31 manifests, 1 permanent marker) |
| Recovery payload | 1,883,363 bytes |
| Frontiers / updates | 31 / 4,127 |
| Logical update digest before close | `sha256:5c5db83b6b043e1afa8445e810719f3c45a9dc09c77100363fb4a8280f0be530` |
| Digest after fresh Worker reopen | same; zero load mismatches |
| Bundle digest | same; all 31 manifests then marked exported |
| Physical SAH-pool files | 6 files, 2,260,992 bytes |
| Storage API usage delta | 2,262,358 bytes |
| Permanent-marker commit | 3.640 ms |
| Primary 257-update frontier commit | 18.000 ms |
| Commit then forced Worker termination | 257 updates and marker recovered exactly; DB was not closed before `terminate()` |
| Forced-termination commit / reopen-load | 36.415 ms / 25.740 ms |
| Corrupt canonical row | typed `StudioCrdtRecoveryCorruptionError`; zero partial frontiers returned |
| localStorage / IndexedDB / memory durable fallback | 0 / 0 / 0 |
| Unexpected console / page / request / HTTP >=400 / CSP errors | 0 / 0 / 0 / 0 / 0 |

SAH-pool files use opaque names, so table/index/WAL physical-byte attribution is unavailable and
recorded as `null`, not zero. Dedicated Worker peak memory is also `null`: this Chromium exposes no
Worker peak observer. Page heap snapshots are retained separately and are not relabeled as Worker
memory.

### Latency distributions

Nearest-rank percentile values retain every raw sample. Save samples are intentionally progressive:
each 129-update frontier is added to the same authenticated work so the distribution includes the
cost of scanning a growing 31-frontier recovery scope rather than an unrealistically empty table.

| Operation | Samples | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Save 129-update multi-chunk frontier | 30 | 75.495 ms | 131.265 ms | 134.820 ms |
| Load and validate all 31 frontiers | 30 | 126.670 ms | 134.105 ms | 179.470 ms |
| Durable exported-status replacement | 31 | 2.495 ms | 2.825 ms | 6.185 ms |
| Build 1,853,078-byte recovery bundle | 30 | 0.655 ms | 1.775 ms | 2.445 ms |

### Bounded contention verdict

Two Dedicated Workers were started against the same SAH-pool. The owner committed its 129-update
frontier and held the database for 1,000 ms. The contender was rejected after 36.305 ms with
`NoModificationAllowedError` because Chromium does not permit a second SyncAccessHandle owner for
the same pool files. A fresh third Worker recovered the owner's exact digest and confirmed zero
contender rows. This lane is therefore **quarantined as single-owner**, not advertised as concurrent
multi-Worker support.

sqlite-wasm emitted seven expected `opfs-sahpool` console errors while performing that deliberate
rejection and VFS cleanup. They remain verbatim in `diagnostics.consoleErrors`, are separately
classified as `expectedQuarantinedConsoleErrors`, and are accepted only when the measured
contention claim is `quarantined-single-owner`. Unexpected console errors remain a hard failure.

### Remaining fault and platform gates

- full Chromium process crash or SIGKILL rather than Dedicated Worker termination;
- OS crash, power loss, storage-controller cache, and hardware `fsync` semantics;
- OPFS quota exhaustion and full SAH-pool capacity injection;
- long-duration multi-tab ownership handoff and contention scheduling;
- Windows, Linux, mobile, Safari, and Firefox filesystem matrices;
- authenticated multi-device Yjs convergence and authoritative server receipt deduplication;
- 8h/24h collaboration soak with rejection close to pagehide or browser termination;
- external CSP blind quality parity, which this storage benchmark does not claim.
