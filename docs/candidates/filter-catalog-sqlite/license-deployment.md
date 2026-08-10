# Filter catalog SQLite license and deployment

## Components

| Component | Pin / source | License | Deployment role |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, installed package manifest | Apache-2.0 | Lazy browser SQLite runtime and Node evidence harness |
| SQLite core | Bundled by the official wasm package | Public domain | SQL engine |
| OPFS SAH-pool VFS | Official sqlite-wasm API | Apache-2.0 package distribution | V12-only durable browser file `/studio-local-v12.db` under `toonspectrum-studio-sqlite`; the legacy `/studio-local.db` is never reopened |
| V12 fallback adapter | ToonSpectrum source | Project license | Compatibility only when SQLite is unavailable |

No dependency or lockfile change is required; the pinned sqlite-wasm package already
serves history, tournament, brush, autosave, and recovery lanes. Filter catalog v4
reuses the shared app-lifetime database handle so feature chunks cannot race while
installing a second SAH-pool VFS.

## Bundle and worker boundary

The SQLite module remains a dynamic import in `studio-local-database.ts`. Product code
does not add a top-level sqlite-wasm import. The real browser evidence uses a Vite
production-bundled module Dedicated Worker and emits the sqlite wasm, async OPFS proxy,
and worker assets without changing product dependencies. OPFS support is checked before
VFS installation; unsupported browsers receive a typed `SqliteUnavailableError` and may
use the separate V12 fallback key.

The benchmark preview sends COOP `same-origin`, COEP `require-corp`, CORP `same-origin`,
and a default-deny CSP with same-origin module worker/script and `wasm-unsafe-eval`.
Chromium reported zero console errors/warnings, page errors, failed requests, HTTP error
responses, and worker/page CSP violations. The six SAH-pool files occupied 8,536,064
bytes for the 10,000-row filter corpus.

## Data lifecycle

- Current V12 filter table and V12 fallback key belong to the Studio destruction
  inventory and may be discarded at the V12 cutover boundary.
- The legacy v1 key is neither read nor deleted by product open. It remains inert so no
  old Studio data is resurrected accidentally.
- Explicit import is test/developer recovery functionality, requires the literal
  `{ explicit: true }`, and writes an audit marker under
  `studio-filter-library-explicit-imports`.
- Filter payloads are local-only; no network upload, telemetry, or marketplace claim is
  implied by SQL persistence.
- Constructor receipts must continue to show only `/studio-local-v12.db`; opening the
  legacy logical filename is a release failure even though the OPFS root is shared.

## Bounded product consumer

An uncapped SQL authority does not imply an unbounded browser DOM. `StudioFilterDialog`
requests engine-filtered pages of 128 rows, exposes explicit load-more, and displays the
SQL `totalCount`. A generation fence discards stale async page completions. This keeps
render and memory work bounded without changing mutation authority or introducing a
catalog-size cap.

## Replacement condition

Replace SQLite only if another provider demonstrates equal canonical-data integrity,
atomic batch semantics, deterministic uncapped keyset pagination, and equal-or-better
10k p95 latency under the same corpus. Any replacement must preserve the discard policy
and must not reinterpret the old ToonStudio key as product data.
