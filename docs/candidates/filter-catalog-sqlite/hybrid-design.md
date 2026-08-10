# Filter catalog SQLite hybrid design

## Product authority

```text
/studio filter preset reads and mutations
  -> shared acquireStudioLocalDatabase()
  -> OPFS SAH-pool /studio-local-v12.db
  -> filter_library_records (schema v4)
  -> canonical payload verification
  -> deterministic keyset pages

only when open throws SqliteUnavailableError
  -> V12-only localStorage fallback key
  -> same async repository contract
```

There is no automatic path from the old
`toonspectrum.studio-creator-filter-presets.v1` key into product state. V12 starts with
an empty filter table even when the old key exists. The old reader is reachable only
through `importLegacyFilterLibraryToSqlite(..., { explicit: true })` for test/developer
recovery. This enforces `LEGACY_DATA_MIGRATION=FALSE` and
`DISCARD_EXISTING_STUDIO_DATA=TRUE` without deleting unrelated platform data.

## Schema v4

`filter_library_records` stores normalized `id`, `name`, `package_id`, `entry_id`,
`engine`, `category`, `search_text`, `favorite`, `sort_order`, `created_at`, and
`updated_at` columns beside a canonical JSON payload. Reads parse and normalize the
payload, reproduce its canonical bytes, and compare every indexed column. A mismatch is
reported as corruption rather than silently accepting one representation.

The primary order is:

```text
favorite DESC, sort_order ASC, updated_at DESC, id ASC
```

The cursor carries exactly these fields. Page size bounds one query but is never a
catalog-size cap. Category, engine, favorite, and normalized substring search filters
compose before cursor evaluation. Batch put and batch delete execute in SQLite
transactions.

## Product wiring

- `StudioFilterDialog` opens the shared repository asynchronously, subscribes to
  mutations, and displays `무제한 · 로컬 SQL` when SQLite owns the data. It requests
  the selected engine only, consumes 128-row keyset pages, exposes explicit load-more,
  and displays the repository `totalCount`; it does not materialize the whole catalog
  into the DOM.
- A generation fence rejects stale page completions after engine/search/repository
  changes, so an older async response cannot overwrite the current bounded view.
- Creator Pack install/update/remove uses the same repository. Filter mutations never
  use the synchronous v1 runtime and never return a filter-catalog `full` status.
- Community share candidates receive filter rows from SQLite instead of reading the
  legacy key.
- A synchronous old-data boot cache is intentionally not used because the V12 discard
  policy takes precedence over boot convenience.

## Failure semantics

- `SqliteUnavailableError`: use only the V12 fallback key.
- SQLite constraint, corruption, migration, quota, or generic exception: surface an
  error; do not downgrade.
- Canonical/index mismatch: reject the row and identify it as corrupt.
- Legacy key present: ignore it in product open; explicit import remains quarantined.

## Real browser authority receipt

The promotion harness builds the page and module Dedicated Worker with Vite production
mode, serves COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, and a CSP that
permits only same-origin workers/scripts plus wasm evaluation. In Chromium
140.0.7339.186 it recorded:

- two product opens, both exactly `/studio-local-v12.db`;
- zero non-V12 database opens, memory DB constructors, localStorage API/fallback use;
- close followed by reopen in 0.695 ms, with `opfs-filter-09999` recovered;
- 10,000 canonical rows and a 39-page full keyset scan with no duplicate, missing,
  unexpected, or order-mismatched ID;
- expected and observed order SHA-256
  `3f57901a139ebf1826176bcb5cd591540092faf3f11d1cd3eef0add097ef7435`;
- six physical OPFS files totaling 8,536,064 bytes;
- zero console errors/warnings, page errors, request failures, HTTP error responses,
  worker CSP violations, and page CSP violations.

The benchmark page is diagnostic infrastructure only. Product UI retains its 128-row
bounded consumer while the repository remains uncapped.
