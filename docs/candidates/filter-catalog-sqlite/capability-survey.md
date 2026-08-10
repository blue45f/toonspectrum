# Filter catalog SQLite capability survey

Date: 2026-08-09
Authority: `NO_FILTER_CATALOG_CAP=TRUE`, `LEGACY_DATA_MIGRATION=FALSE`,
`DISCARD_EXISTING_STUDIO_DATA=TRUE`

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `@sqlite.org/sqlite-wasm` 3.53.0-build1 + OPFS SAH-pool | Transactional structured rows, indexes, deterministic keyset pagination, one shared local authority | OPFS sync access handle support is browser-dependent | Preserves canonical preset payload exactly; no rendering approximation | Real Chromium OPFS 10k: insert-250 50.305/80.810/90.215 ms; page-257 4.825/26.000/30.690 ms; NFKC search 4.115/6.055/6.410 ms; category+engine+favorite 1.190/1.500/1.785 ms | Physical OPFS 8,536,064 B; storage estimate 8,537,424 B. Worker memory API unavailable, so no invented heap estimate | Existing lazy sqlite-wasm chunk; Vite output contains worker/proxy and one wasm asset; shared DB handle, no second engine | Canonical JSON + total order `(favorite DESC, sort_order ASC, updated_at DESC, id ASC)`; 10k digest matched after reopen | Apache-2.0 package; SQLite core is public domain | Low: repository maps stable preset model to normalized columns | OPFS browser support and schema migration ownership | Primary product authority; real Dedicated Worker gate passed |
| IndexedDB structured records | Broad browser availability and native async API | No SQL query planner; compound substring/category/favorite queries and transactional migrations require more custom code | Payload can be exact | Not promoted: no equivalent 10k product-path measurement | Browser-managed | No extra bundle | Deterministic only with custom composite key discipline | Web platform | Medium | Higher custom query/migration burden | Rejected as primary; future disaster-recovery candidate only |
| V12-specific localStorage fallback | Works when SQLite/OPFS is genuinely unavailable; simple recovery boundary | Quota, whole-array rewrites, weak query/index behavior | Canonical payload is retained | Not a performance candidate | Browser quota-bound | Zero extra bundle | Repository applies the same total order | Web platform | Medium | Capacity and concurrent-write risk | Explicit compatibility fallback only, key `toonspectrum.studio-filter-library.v12.fallback` |
| Legacy ToonStudio v1 localStorage array | Existing deployments may contain old presets | Violates V12 discard authority; historical 40-item cap and old schema | Unknown old payload provenance | Not measured and not eligible | Unknown | None | Historical order only | Internal legacy data | High semantic risk | Data resurrection and hidden-loss risk | Quarantined; explicit test/dev import only |

## Selection

SQLite wins because it is the only measured candidate that combines canonical payload
verification, atomic multi-row writes, indexed search/filtering, and uncapped keyset
pagination. The fallback is selected only after an actual `SqliteUnavailableError`.
Corruption, migration, quota, and arbitrary database failures remain visible errors and
never trigger a second authority.

The product consumer is deliberately bounded without capping the catalog:
`StudioFilterDialog` asks for the active engine in 128-row keyset pages, exposes
load-more and SQL `totalCount`, and uses a generation fence to discard stale async page
results. SQLite remains the only mutation authority regardless of how many pages the UI
has materialized.

The promoted measurement is
`tests/benchmarks/results/filter-library-opfs-browser.json`: Chromium
140.0.7339.186, Vite production bundle, cross-origin-isolated module Dedicated Worker,
real `openStudioLocalDatabase({vfs: "opfs"})`, and the product filter repository. Both
recorded database opens were `/studio-local-v12.db`; non-V12, memory, and localStorage
open/fallback counts were zero. The earlier Node memory-VFS result remains a repeatable
SQL microbenchmark, not the filesystem promotion evidence.
