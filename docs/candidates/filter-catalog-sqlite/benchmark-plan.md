# Filter catalog SQLite benchmark plan and result

## Reproduction

```bash
pnpm exec tsx tests/benchmarks/harness/filter-library-sqlite.ts
pnpm exec tsx tests/benchmarks/harness/filter-library-opfs-browser.ts
pnpm exec vitest run tests/visual/filter-library-sqlite-contract.test.ts
pnpm exec vitest run tests/visual/filter-library-opfs-browser-contract.test.ts
```

The harness initializes the real `@sqlite.org/sqlite-wasm` 3.53.0-build1 module and
opens the same schema/query implementation used by OPFS, using the wasm memory VFS so
the Node benchmark is reproducible. It creates exactly 10,000 normalized V12 presets
(3,595,243 source JSON bytes), writes 40 transactional batches of 250, scans all rows
through 257-row keyset pages, then records 100 search and 100 composed
category/engine/favorite queries. Raw samples are committed in
`tests/benchmarks/results/filter-library-sqlite.json`.

## Measured result (Apple M2 Max, Node v24.16.0)

| Operation | p50 | p95 | p99 | Samples |
|---|---:|---:|---:|---:|
| Insert 250-row transaction | 5.2504 ms | 8.8940 ms | 10.8119 ms | 40 |
| 257-row keyset page | 4.5397 ms | 4.9864 ms | 7.2740 ms | 39 |
| Normalized substring search | 4.9186 ms | 6.0903 ms | 6.6993 ms | 100 |
| Category + engine + favorite | 1.3813 ms | 1.7797 ms | 1.9890 ms | 100 |

Total insertion time was 223.2413 ms. The full keyset scan returned 10,000 unique IDs
with no duplicate or missing row. RSS moved from 177.94 to 230.61 MiB; sampled JS heap
moved from 60.50 to 59.98 MiB after GC activity.

## Real Chromium Dedicated Worker OPFS result

The promoted harness uses the exact product
`openStudioLocalDatabase({ vfs: "opfs", loadSqlite })` and
`createSqliteFilterLibraryRepository(database)` paths in a Vite production-bundled
module Dedicated Worker. Chromium 140.0.7339.186 ran with COOP/COEP/CORP, a restrictive
worker/wasm CSP, and a temporary clean browser origin. Raw evidence is committed in
`tests/benchmarks/results/filter-library-opfs-browser.json`.

| Real OPFS operation | p50 | p95 | p99 | Samples |
|---|---:|---:|---:|---:|
| Insert 250-row transaction | 50.305 ms | 80.810 ms | 90.215 ms | 40 |
| 257-row keyset page, full 10k scan | 4.825 ms | 26.000 ms | 30.690 ms | 39 |
| ID lookup | 0.190 ms | 0.290 ms | 0.360 ms | 200 |
| NFKC substring search (`ＣＯＭＩＣ`) | 4.115 ms | 6.055 ms | 6.410 ms | 60 |
| Category filter | 1.305 ms | 1.660 ms | 2.875 ms | 60 |
| Favorite filter | 1.280 ms | 1.600 ms | 2.375 ms | 60 |
| Category + engine + favorite | 1.190 ms | 1.500 ms | 1.785 ms | 60 |

The browser inserted 10,000 rows in 2,071.290 ms (4,827.91 presets/s), closed the DB,
reopened it in 0.695 ms, and recovered the final probe. The full scan produced exactly
10,000 unique IDs over 39 pages, with zero duplicate/missing/unexpected/order mismatch.
The physical OPFS directory contained six files totaling 8,536,064 bytes; the browser
storage estimate reported 8,537,424 filesystem bytes. Worker memory measurement APIs
were unavailable, so the report preserves `null` instead of substituting an estimate.

Constructor instrumentation recorded exactly two OPFS database opens, both
`/studio-local-v12.db`; non-V12 database opens, memory database opens, and localStorage
fallbacks were all zero. Console errors, console warnings, page errors, failed requests,
HTTP error responses, and worker/page CSP violations were all zero.

## Gates

- Exact saved and scanned count: 10,000.
- No catalog-size constant or truncating slice in the SQL product path.
- Raw samples must recompute the committed p50/p95/p99/mean values.
- Insert total below 5 seconds on the reference host.
- Insert batch, page, search, and composed-filter p95 below 100 ms.
- Policy fields must remain `NO_FILTER_CATALOG_CAP=true`,
  `LEGACY_DATA_MIGRATION=false`, and `DISCARD_EXISTING_STUDIO_DATA=true`.
- Product open source must not call the explicit legacy import function or reference the
  v1 key.
- Product browser receipt must show two `/studio-local-v12.db` opens and zero non-V12,
  memory, or localStorage opens/fallbacks.
- Close/reopen must recover the final row, and the deterministic 10k order digest must
  match with no duplicate or missing ID.
- The production response must carry COOP/COEP/CORP/CSP; console, network, page, and CSP
  error arrays must remain empty.
- Product `StudioFilterDialog` consumption remains engine-filtered, 128-row keyset
  paged, explicit-load-more, `totalCount` aware, and generation-race fenced. This is a
  bounded view over an uncapped repository, not a catalog cap.

## Gate status

The real Chromium OPFS filesystem gate is passed. The Node memory-VFS report remains a
portable SQL-only comparator and is not used as a proxy for OPFS latency. Environment
support remains conditional at runtime: only a genuine `SqliteUnavailableError` may
select the V12-only fallback.
