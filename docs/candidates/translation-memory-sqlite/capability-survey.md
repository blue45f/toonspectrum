# Translation-memory SQLite capability survey

Date: 2026-08-09
Product decision: V12 shared SQLite/OPFS is the default dialogue translation-memory authority.

The semantic quality axis for this storage subsystem is not rendered pixels. It is exact
preservation of the engine-neutral translation-memory document, language/speaker/work scoping,
exact and conservative fuzzy search, stale detection, glossary conflict behavior, and explicit
reuse. Performance never overrides a failed semantic-integrity gate.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `@sqlite.org/sqlite-wasm` 3.53.0-build1 + OPFS SAH-pool | Transactions and a durable local file shared with the other V12 Studio metadata authorities; exact close/reopen; no whole-library browser key rewrite | Requires WASM, OPFS, SyncAccessHandle and compatible browser policy; OPFS is not backup or cross-device sync | **Pass:** 296,700B canonical TM JSON and SHA-256 were byte-exact before close and after reopen; 512/512 entries; exact/fuzzy/language-isolation search passed | Real Chromium save 512 rows: **7.965/13.860/16.255ms** (30); load: **8.715/9.915/10.075ms** (50); cold open 33.630ms, reopen 0.535ms | Worker/WASM peak is not exposed by the browser APIs used, so it is **unmeasured**. Physical OPFS: 794,624B across 6 files | Production probe: TM Worker 252,458B; shared SQLite WASM 864,752B, worker 210,936B, OPFS proxy 32,289B. Source maps excluded; probe corpus code is not product incremental size | Canonical JSON equality, matching SHA-256, 50/50 repeated loads with zero mismatch | Package Apache-2.0; SQLite core public domain | Low: stable TM v1 JSON ↔ V12 KV row | Low-to-medium: browser OPFS policy, quota and sqlite-wasm pin | **Primary product authority**, namespace `studio-translation-memory-v12`, key `library-v1`, DB `studio-local-v12.db` |
| IndexedDB object store | Broad browser availability, async main-thread API, no WASM startup | No installed product repository, weaker ad-hoc transaction/query consistency with the shared V12 SQLite authority, would create a second local source of truth | Unmeasured; would require the same canonical JSON/hash/search corpus | Unmeasured | Unmeasured | No new runtime if implemented directly; implementation and migration code not present | Can preserve blobs, but no current reopen/hash evidence | Web platform | Medium: separate DB lifecycle and deletion inventory | Medium-high: split authority and dual recovery path | **Rejected as default**; reconsider only if target browsers cannot support the selected OPFS path and equivalent evidence is produced |
| Previous localStorage key `toonspectrum-studio-translation-memory:v1` | Simple synchronous test/embed compatibility | Whole-document quota/write amplification, no transactions, weak concurrency, blocks main thread, legacy Studio data | Existing format validation is reusable, but it has no durable V12 authority evidence | Not a performance candidate | Browser quota-bound; no reliable peak measure | Zero extra bundle | Last writer wins; no ordered async write contract | Web platform | Low technically, high policy cost | High: silent legacy migration and quota corruption risk | **Explicit test/embed seam only**. Product default never reads it; `LEGACY_DATA_MIGRATION=FALSE` |
| In-memory entries / SQLite memory VFS | Fast deterministic tests and explicit temporary editing session | Lost on refresh, crash or tab close; no OPFS/reopen proof | Semantic unit tests pass, but durability quality is absent | Not promoted from unit-test timings | Process heap only | No OPFS cost | Deterministic during one process | Internal code / SQLite terms if WASM used | Low | Low if visibly temporary; high if mislabeled durable | **Explicit memory-only mode and tests**, never a silent product fallback |

## Selection conclusion

The selected hybrid is not “SQLite owns translation semantics.” The stable TM v1 model continues to
own normalization, validation, import/export, glossary and search. SQLite owns only local durability
of that canonical document. This keeps interchange engine-neutral and makes replacement possible:
another store must reproduce the same canonical bytes, search behavior, failure semantics and V12
discard policy before promotion.
