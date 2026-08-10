# BG3D library SQLite/OPFS capability survey

## Decision

The V12 product authority for the BG3D model library, reusable scene templates, and asset metadata
is the app-lifetime shared SQLite database plus a dedicated OPFS SHA-256 CAS. SQLite stores only
strict canonical manifests, rights receipts, validation metrics, indexes, revisions, and deletion
evidence. GLB and thumbnail bytes never enter SQLite TEXT.

The old model, template, and metadata IndexedDB databases remain explicit legacy import/test seams.
Product modules import the `V12` model/template operations and metadata selects IndexedDB only when
the caller supplies its own `indexedDb` option. Ambient `globalThis.indexedDB` is not consulted by
the product path, consistent with `LEGACY_DATA_MIGRATION=FALSE`.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared `studio-local-v12.db` canonical KV manifests + OPFS SHA-256 CAS | Reuses one SQLite lifecycle; binary dedupe; hash verification; manifest-last publication; model/template/metadata share one lock domain | Dual live SAH-pool owners are rejected by Chromium; one storage Worker is required. Cross-browser/device, quota exhaustion and long soak remain | 1/32/100 MiB GLBs and thumbnail restore with exact SHA/bytes; persistence does not alter rendering | Chromium 140 verified reads: 1 MiB 5.395/7.255/7.790 ms and 32 MiB 138.575/140.865/142.550 ms; 100 MiB 5-sample 421.615/432.315/432.315 ms | Worker memory APIs unavailable=`null`; page used JS heap 681,252→1,400,196 B. No estimate substituted | Vite production output 5,075,266 B including maps; BG3D Worker 426,725 B; sqlite WASM 864,752 B; no dependency change | Canonical JSON, sorted records, exact physical CAS SHA/size, monotonic revision; fallback count 0 | Existing pinned sqlite-wasm notices plus Web Platform APIs | Low with one app-lifetime sqlite API/storage Worker; dual Worker DB ownership is infeasible | Whole-manifest rewrite is bounded but 512-model/4,096-metadata and long-soak scaling remain | **Selected and Chromium-promoted for measured dimensions** |
| Structured SQLite model/template/metadata tables + OPFS CAS | Indexed search, row-level updates, SQL constraints | Requires shared schema migration and three new SQL domain surfaces; larger blast radius while current product queries are bounded whole-library reads | Same if CAS verification is retained | Unmeasured | Unmeasured | No new dependency; larger migration/API code | Strong with explicit ordering and transactions | Same as selected | Medium | Schema evolution and cross-table transaction burden | Challenger after measured KV rewrite/query failure |
| Existing three IndexedDB databases | Native Blob rows and mature legacy tests | Parallel durable authority, ambient auto-open risk, separate lifecycle, no shared SQLite recovery | Existing verified bytes | No current browser percentile evidence | Unmeasured | Browser built-in | Per-database transactions only | Web Platform API | High: split authority | Cutover and dual-authority drift | Explicit legacy import/test seam only |
| Raw OPFS JSON manifests plus binary files | Simple file layout and easy manual inspection | No shared SQLite commit boundary, weak cross-feature querying, custom locking and recovery | Same only with extra verification | Unmeasured | Unmeasured | Web Platform only | Requires custom canonical writer | Web Platform API | Medium | Reimplements database semantics | Rejected for product authority |
| Session memory | Works when durable APIs are absent | Lost on refresh; no cross-tab durability; cannot be called saved | In-session bytes unchanged | Not applicable | JS heap proportional to assets | 0 B | Same realm only | N/A | Low | Data loss | Never reported as durable; product writes fail explicitly |

## Automated evidence

`src/domains/creator/studio-bg3d-libraries-sqlite-opfs.test.ts` currently proves:

- actual `@sqlite.org/sqlite-wasm` model/template/metadata writes;
- named memory-VFS close/reopen with identical model SHA-256 and GLB bytes;
- GLB and thumbnail storage as separate OPFS CAS objects, with no data URL in SQLite;
- same-length CAS tamper rejection through a full SHA-256 read;
- torn and future manifest rejection;
- concurrent model writes without lost updates;
- forced SQLite publication failure restoring the prior owner set;
- bounded orphan collection, quota failure without manifest publication, and durable deletion receipt;
- explicit non-durable CAS rejection and zero automatic legacy IndexedDB reads.

The focused V12 test has 12 cases. Existing model/template/metadata and product consumer regressions
add 114 passing cases in the same validation run. Vitest duration is not used as browser latency
evidence.

## Chromium promotion evidence

`tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json` is a passing Vite production
build plus Chromium 140.0.7339.186 artifact. Its focused contract is
`tests/visual/bg3d-libraries-sqlite-opfs-browser-contract.test.ts`. The benchmark uses the actual
unsuffixed product APIs inside Dedicated Workers, the default `acquireStudioLocalDatabase()` path,
the real `studio-local-v12.db` OPFS SAH-pool, and the real BG3D OPFS CAS.

It proves exact deterministic 1/32/100 MiB GLB writes, 100 verified reads at 1/32 MiB, five at
100 MiB, a separately addressed image thumbnail, 100 canonical template writes/lists, 100 canonical
metadata writes/gets, normal close/reopen, force-terminate-without-close recovery, and a measured
250.515 ms product Web Lock wait. All manifest/base64 checks and fallback counters passed; Chromium
diagnostics and CSP violations were zero.

The run also found and verified one minimal browser-only defect: logical close/reopen previously
reinitialized sqlite-wasm and collided with the previous SAH-pool VFS. The shared runtime now keeps
one initialized sqlite API for the app lifetime while still cycling the logical DB handle. Direct
dual-authority Workers remain quarantined because Chromium retains each VFS's SyncAccessHandles for
the owning Worker lifetime. This is evidence for a single storage Worker, not evidence that two
SQLite VFS owners are supported.
