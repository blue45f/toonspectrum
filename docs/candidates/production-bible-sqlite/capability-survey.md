# Production Bible local persistence capability survey

Date: 2026-08-09
Authority: `LEGACY_DATA_MIGRATION=FALSE`, `DISCARD_EXISTING_STUDIO_DATA=TRUE`

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `@sqlite.org/sqlite-wasm` 3.53.0-build1 + OPFS SAH-pool | Shared V12 authority, atomic KV upsert, close/reopen durability, Worker sync access | Portable browser quota forcing API; multi-tab semantic conflict resolution | Metadata is preserved as strict canonical JSON; no rendering approximation | Real Chromium Worker OPFS: save 2.450/2.885/3.685ms; load 0.240/0.385/1.465ms; normal reopen 0.445ms; forced-termination reopen 9.215ms | OPFS files 204,800B; storage estimate 206,162B. Worker heap API was not used, so no invented peak heap | Existing lazy sqlite-wasm Worker/proxy + wasm production assets; no new dependency | Canonical bytes and SHA-256 exact before close, after reopen, and after forced Worker termination | Apache-2.0 wrapper; SQLite core public domain | Low: existing `StudioLocalDatabase.kvGet/kvSet` and product persistence | OPFS/SAH support and shared schema/runtime ownership | Primary product authority; real Dedicated Worker gate passed |
| IndexedDB v1 Production Bible store | Existing legacy documents may exist | Not the V12 authority; old mirror/fallback semantics; no shared SQL transaction boundary | Historical payload quality is unknown | Ineligible; product path does not open it | Browser-managed, unmeasured | Web platform | Historical only | Web platform | High semantic migration risk | Data resurrection and dual-authority risk | Quarantined; explicit test/dev import adapter only |
| localStorage v1 mirror/fallback | Simple historical recovery copy | Whole-value quota, synchronous main-thread API, weak crash/concurrency semantics | Historical payload quality is unknown | Ineligible; product Worker has no localStorage API | Browser quota-bound, unmeasured | Zero bundle | Single string only | Web platform | High | Silent fallback and stale mirror risk | Rejected for product; explicit test/dev import only |
| Session memory recovery | Keeps an accepted edit visible after a surfaced SQLite write failure | No refresh durability; no authority across Worker/tab lifetime | Exact in-session canonical object | Not a persistence candidate | Process heap, unmeasured | Zero | Runtime-local only | Internal | Low | Loss on refresh/termination | Explicit degraded status only; never reported as persisted |

## Selection

SQLite/OPFS is selected because the measured product implementation combines a single
V12 namespace, strict canonical validation, atomic whole-document writes, explicit
failure states, and real close/reopen recovery. The production Worker called the
option-free `createStudioProductionBibleSqlitePersistence()` after registering the
shared `acquireStudioLocalDatabase()` runtime. Constructor instrumentation recorded
two normal opens of `/studio-local-v12.db`, zero memory DB opens, and no localStorage
fallback.

The browser wrote a poison document only under the v1 legacy key. Loading the matching
v12 owner/work scope returned an empty SQLite result before and after reopen, while the
legacy row remained byte-identical. This proves non-read rather than deletion or
accidental normalization.

## Quarantine

Chromium exposes `navigator.storage.estimate()` but no portable API that lowers an
origin's quota to a deterministic test value. A real Worker fault injection delivered
`QuotaExceededError` through the product `acquireDatabase` boundary and proved
`unavailable` load plus explicitly labelled memory-only save with no silent fallback.
Actual browser-enforced quota exhaustion remains quarantined. SAH-pool installation
failure is not quarantined: the harness replaced the real SQLite API's installer with a
throwing implementation and verified the same explicit failure behavior.
