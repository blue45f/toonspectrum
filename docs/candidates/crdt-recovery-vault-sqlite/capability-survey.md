# CRDT recovery vault SQLite capability survey

## Outcome

The V12 product recovery vault uses the existing shared `studio-local-v12.db` SQLite/OPFS
authority. Permanent rejection markers, frontier chunks, and manifest/export state live in the
structured `crdt_recovery_v12_rows` table. Product construction does not read or open the former
`toonspectrum-studio-crdt-recovery-vault` IndexedDB database and does not write a localStorage
marker. `LEGACY_DATA_MIGRATION=FALSE`: old browser-KV data remains only in the explicit destruction
inventory; there is no automatic discovery, merge, or migration.

Storage quality here means that a permanently rejected CRDT update cannot silently become eligible
for resend because a browser-KV fallback claimed durable success. It does not prove Yjs convergence,
server deduplication, renderer parity, or cross-device backup.

## Candidate comparison

| Candidate | Unique strength | Missing features | p50/p95/p99 | Peak memory | Bundle cost | Determinism | License | Interop cost | Maintenance risk | Final role |
|---|---|---|---|---|---|---|---|---|---|---|
| Shared `@sqlite.org/sqlite-wasm` + OPFS, structured v6 rows | Reuses one app-lifetime authority; `BEGIN IMMEDIATE` bounded upserts; scoped SQL ordering; fail-closed row identity and byte validation | Real Chromium OPFS percentiles and multi-tab termination matrix | Browser OPFS **unmeasured** | Browser Worker/WASM **unmeasured** | Reuses existing lazy SQLite chunk; no new package | SQL order is `row_key ASC`; frontier order is manifest chunk index; public entries sort by creation/id | SQLite public domain; wrapper Apache-2.0 | Low: existing vault API is retained | Medium: browser contention/termination still need soak | **Selected V12 product authority** |
| Existing shared SQLite `kv` rows plus a JSON scope index | Uses current KV methods | Index and row require separate commits; a crash can leave missing rows; whole index replacement creates writer races and a second validation format | Not benchmarked | Scope-index-size dependent | No extra package | Same-page queue only; independent writers can race | Same licenses | Low initially | High authority/index drift risk | **Rejected and removed** |
| Standalone IndexedDB vault | Browser built-in and prior code already existed | Separate schema, open lifecycle, diagnostics and destruction path; product boot would preserve fragmented authority | Not rerun | Unmeasured | Browser built-in | Indexed scope scans still require app validation | Web standard | Medium | High fragmented-authority risk | **Legacy data only; never opened automatically** |
| localStorage permanent-rejection marker | Synchronous same-page write attempt | Quota/security exceptions, per-origin pressure, corrupt key scans, and false confidence when the frontier is not durable | Not applicable | Small but unbounded key accumulation | None | Key iteration order irrelevant but corruption semantics are bespoke | Web standard | Low | Unacceptable silent durable-success risk | **Removed** |
| Module-memory marker latch | Immediately blocks the current binding before async SQL | Lost on reload and not shared across tabs | Not applicable | Marker-count dependent for page lifetime | None | Current-page insertion/identity only | Application code | Low | Must never be called durable | **Explicit ephemeral fail-closed latch only** |

## Selected v6 schema

`crdt_recovery_v12_rows` stores:

- authenticated `scope` and `work_id`;
- deterministic logical `row_key`;
- constrained `row_kind`: permanent rejection, frontier chunk, frontier manifest, or an explicit
  in-process legacy-shaped test seam;
- JSON payload and UTF-8 `payload_bytes`;
- local `updated_at` diagnostic timestamp.

The primary key is `(scope, work_id, row_key)`. `crdt_recovery_v12_scope_order` gives a bounded,
deterministic scoped scan without a separately committed JSON index.

## Bounds and no-drop policy

| Bound | V12 value | Behaviour at limit |
|---|---:|---|
| Rows per user/work | 100,000 | Reject the incoming commit; never evict an older marker/frontier |
| Payload bytes per user/work | 512 MiB | Reject the incoming commit; keep all prior rows |
| One stored row | 3 MiB UTF-8 | Reject before commit |
| Updates per chunk | 128 | Start a new chunk |
| Approximate JSON characters per chunk | 2 MiB | Start a new chunk before exceeding the threshold |

Each SQL put performs its capacity read and upsert in one `BEGIN IMMEDIATE` transaction. Bounds are
per authenticated scope and work, not global. Same-page memory is outside the durable count and
cannot turn a rejected SQL promise into success.

## Current evidence and unmeasured gates

- Real `@sqlite.org/sqlite-wasm` memory-VFS tests execute v6 SQL; no Map SQL emulator is used.
- A named WASM VFS file closes and reopens with one marker, three chunks, and the exact 257-update
  frontier intact.
- A forced manifest trigger failure leaves the already committed permanent marker and chunk, no
  manifest, and a subsequent scoped read fails closed on the orphan chunk.
- Canonical JSON corruption with a matching stored byte count raises
  `StudioCrdtRecoveryCorruptionError`; it is not filtered out.
- SQLite write failure raises `StudioCrdtRecoveryDurabilityError` with `durability: "degraded"`;
  the current page latch remains visible but is not reported as durable.
- A lowered real-SQL row limit rejects the next row and leaves the first recovery row intact.
- Migration fault injection proves failed v6 DDL rolls back to intact v5 data.
- Product source boundary tests prohibit localStorage/IndexedDB authority and retain the existing
  collaboration recovery lock wiring.
- Real Chromium OPFS latency, physical storage bytes, peak memory, multi-tab contention, quota
  exhaustion, browser termination, and OS/browser matrices remain **unmeasured**.
