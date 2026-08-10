# CRDT outbox SQLite capability survey

## Outcome

The shipped collaboration outbox now uses the existing shared V12
`studio-local-v12.db` SQLite/OPFS authority. Product boot does not open
`toonspectrum-studio-crdt-outbox` IndexedDB. That database remains reachable only through the
explicit `LegacyIndexedDbStudioCrdtOutbox` import/test seam; there is no automatic read or
migration (`LEGACY_DATA_MIGRATION=FALSE`).

Storage quality in this survey means preservation of ordered, unacknowledged CRDT update requests
and their stable publication IDs. It does not prove Yjs convergence, renderer parity, or CSP
workflow superiority.

## Candidate comparison

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shared `@sqlite.org/sqlite-wasm` + OPFS, structured v5 tables | `BEGIN IMMEDIATE` enqueue/ACK/retry transactions, SQL ordering and bounds, one app-lifetime authority, close/reopen diagnostics | Real Chromium OPFS percentiles, browser multi-tab contention matrix, ACK tombstone GC | Exact canonical `StudioCrdtUpdateRequest` round-trip; no renderer object or pixel data | Real sqlite-wasm functional tests pass; browser OPFS **unmeasured** | Browser Worker/WASM **unmeasured** | Reuses existing lazy SQLite chunk and shared handle; no new package | SQL order is `client_sequence`, `created_at`, `update_id`; canonical JSON is byte-checked | SQLite public domain; wrapper Apache-2.0 | Low: current outbox API maps directly to structured methods | Medium: tombstone lifecycle and browser contention need soak | **Selected V12 product authority** |
| One SQLite KV canonical envelope per `(scope, work)` | A single row replacement is atomic and simple | Read-modify-write can overwrite a concurrent writer unless all writers share one process lock; whole queue rewrites scale with backlog | Canonical JSON could preserve requests | Not benchmarked | Queue-size dependent | No extra bundle | Deterministic only with a single writer | Same SQLite licenses | Low initially | High lost-update risk across writers | **Rejected** |
| Existing standalone IndexedDB rows + tombstones | Browser built-in, prior same-page late-put protection | Separate authority/schema/deletion path, timeout ambiguity, no shared SQL diagnostics, product cutover would auto-read legacy data | Request bytes can be exact when rows are valid | Not rerun | Unmeasured | Browser built-in | Indexed index order still requires app sort | Web standard | Medium | High authority fragmentation | **Explicit legacy import/test seam only** |
| Memory emergency map | Keeps the current tab editable when durable storage is unavailable or at capacity | Lost on reload; not a durable source; not shared across tabs | Exact in-tab request object | Not applicable | Bounded by the same per-work count/bytes limits | None | Process-lifetime order only | Application code | Low | Must never be labelled saved | **Visible emergency copy only** |
| Server-only retry without local outbox | No browser storage | Offline/closing tabs lose unacknowledged changes before publication | Not applicable | Network-dependent | Low local | None | Server receipt only after upload | Application/server stack | High during outage | Unacceptable data-loss boundary | **Rejected** |

## Selected v5 schema

- `crdt_outbox_v12_entries`: one canonical pending update per `(scope, work_id, update_id)` with
  ordering, byte count, creation/update timestamps and retry diagnostics.
- `crdt_outbox_v12_acknowledgements`: durable ACK tombstone checked inside enqueue transactions.
- `crdt_outbox_v12_order`: deterministic scoped scan without application-side index discovery.
- `crdt_outbox_v12_ack_time`: deterministic future maintenance order; no automatic tombstone
  deletion is shipped in this change.

## Bounds and no-drop policy

| Bound | V12 value | Behaviour at limit |
|---|---:|---|
| Pending entries per user/work | 65,536 | Reject new durable enqueue; do not evict existing rows |
| Canonical pending bytes per user/work | 256 MiB | Reject new durable enqueue; do not evict existing rows |
| One canonical request | 96 KiB | Reject before durable write |
| Retry error code | 160 characters | Reject malformed metadata |
| Retry error message | 2,048 characters | Reject malformed metadata |

The same-tab emergency map is also bounded. A failed durable enqueue remains visible there and the
outbox health becomes `degraded`; it is never silently reported as durable.

## Current evidence and unmeasured gates

- Real `@sqlite.org/sqlite-wasm` executes the schema and all queue SQL in tests.
- A named wasm VFS file is closed and reopened; ordered rows and retry metadata remain identical.
- A SQLite trigger aborts the pending-row DELETE after ACK insertion; the whole transaction rolls
  back, leaving one pending row and zero ACK rows.
- Canonical JSON corruption with internally consistent byte length is rejected fail-closed.
- Conflicting reuse of an update ID rejects without replacing the original payload.
- Browser OPFS p50/p95/p99, physical bytes and Worker/WASM peak memory are **unmeasured**.
- Yjs multi-device convergence, network partitions, server receipt deduplication and CSP task-flow
  parity remain separate release gates; this storage change does not claim them complete.
