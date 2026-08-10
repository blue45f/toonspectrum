# BG3D shot-batch recovery persistence capability survey

## Decision summary

The selected V12 product authority is a canonical SQLite KV catalog plus SHA-256 OPFS CAS. A shot
batch performs point lookup and whole-job state transitions; it does not search, filter, or page
recovery records. Publishing one canonical catalog row therefore gives the lease, revision, global
budget, deterministic ordering, job metadata, and artifact references one SQLite statement boundary.
PNG and PSD bytes are never embedded in SQL.

The former IndexedDB store remains an explicit import/test seam only. Product boot does not inspect
it, in accordance with `LEGACY_DATA_MIGRATION=FALSE`.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared V12 SQLite KV canonical catalog + OPFS SHA-256 CAS | One atomic catalog publication; reuses app-lifetime SQLite handle; binary deduplication and verification | Actual browser OPFS timing and multi-device matrix not yet measured | Byte-identical verified PNG/PSD restored and revalidated; no renderer changes | Unmeasured as isolated browser percentiles; real sqlite-wasm close/reopen functional gate passed | Browser/Worker peak unmeasured | Existing sqlite-wasm and OPFS asset modules; no new dependency | Canonical JSON, sorted job keys, stable SHA-256 addresses | Existing dependencies retain their recorded licenses; local glue is project code | Low: async KV plus existing CAS | Catalog row grows with metadata, bounded to 64 jobs/512 MiB origin ledger | **Selected product authority** |
| Structured SQLite job/artifact/lease tables + OPFS CAS | Efficient partial queries and row-level GC | Requires a shared schema migration and multi-table API outside this bounded store | Same binary quality if CAS is shared | Unmeasured | Unmeasured | No new runtime dependency, larger schema/API surface | Deterministic with explicit ordering | Same as selected | Medium: new DB methods and migration | Higher migration and transaction maintenance | Challenger if query or catalog-size evidence requires it |
| Existing IndexedDB jobs/artifacts/leases/meta | Native Blob transaction and mature existing tests | Parallel durable authority, separate DB lifecycle, legacy auto-read risk | Existing verified bytes | Existing focused tests pass; no new browser percentile claim | Unmeasured | Browser built-in | Transactional but separate from V12 authority | Web Platform API | High: duplicates SQLite ownership | Split-brain and cutover burden | Explicit legacy/test seam only |
| Session memory | Works without durable browser APIs | Lost on refresh; no cross-tab durability | In-session bytes unchanged | Not relevant | Bounded by existing 512 MiB ledger | 0 B | Same-tab only | N/A | Low | Data loss on reload | Explicit degraded mode only when safe fencing is unavailable |

## Measured functional evidence

- Existing legacy behavior: 23 focused tests remain green.
- V12 SQLite/OPFS behavior: 7 additional focused tests are green.
- Real `@sqlite.org/sqlite-wasm` named memory-VFS close/reopen restores the completed job, queue,
  byte ledger, image Blob, and CAS reference.
- Torn canonical JSON, modified CAS bytes, stale lease takeover, and failed SQLite commit all fail
  closed or resume from the last committed checkpoint.
- A completed legacy IndexedDB record is deliberately invisible to a default V12 store.

No browser p50/p95/p99 or 3D visual comparison is inferred from Vitest wall-clock duration.
