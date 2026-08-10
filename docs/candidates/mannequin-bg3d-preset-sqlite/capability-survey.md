# Mannequin and BG3D LT preset local-authority capability survey

Date: 2026-08-09
Subsystem: 3D mannequin state and user-authored BG3D line-and-tone presets

## Decision context

Both payloads are durable creative state rather than preferences. The existing product paths used
synchronous `localStorage`, hid mannequin close-write failures, and made the LT library a second
browser-KV authority beside V12 SQLite. V12 keeps the existing `/studio` UI but moves both defaults
to the app-lifetime `studio-local-v12.db` handle. `LEGACY_DATA_MIGRATION=FALSE` means old keys are
never probed at product boot; their helpers remain only for explicit import and tests.

## Candidate comparison

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared `@sqlite.org/sqlite-wasm` + OPFS SAH pool | Reuses one V12 local authority, canonical KV rows, async I/O and existing recovery lifecycle | Multi-tab conflict UX, broader browser/OS matrix and mid-transaction process kill remain | Lossless engine-neutral body/pose and LT parameters; rendering algorithms unchanged | Chromium Dedicated Worker: mannequin save 2.305/2.600/2.920 ms and load 0.170/0.200/0.230 ms; LT save 8.715/9.520/10.655 ms and load 4.140/4.990/5.270 ms | Worker memory APIs unexposed; raw values are `null`, so peak is unclaimed | Existing pinned runtime in a measured Vite production bundle; no new dependency | Byte-canonical rows, invocation-ordered writes, graceful reopen and forced-Worker reopen all pass | SQLite public domain; wrapper license already in repository notices | Low through `acquireStudioLocalDatabase()` | Low/medium: OPFS quota and browser matrix | **Product default, production-browser verified** |
| `localStorage` | Small synchronous API and old deployed keys | Main-thread I/O, no transaction/queue, weak corruption boundary, small quota, hidden write failure | Lossless only when a write succeeds | Not promoted; synchronous timing not measured | Unmeasured | 0 B | Deterministic strings | Web Platform API | Low initially, high recovery cost | High as creative authority | Explicit legacy import/test seam only |
| Dedicated IndexedDB database | Async storage with broad browser support | Adds another schema, connection, transaction and recovery owner beside SQLite | Lossless | Unmeasured | Unmeasured | 0 B platform API | Depends on bespoke protocol | Web Platform API | Medium/high | Medium/high duplicate authority | Rejected for this slice |
| Raw OPFS JSON files | Direct durable files | Must reimplement atomic replace, locking, migration, indexing and corruption handling | Lossless | Unmeasured | Unmeasured | 0 B platform API | Possible with additional protocol | Web Platform API | Medium | High bespoke maintenance | Rejected for small metadata rows |

## Implemented result

- `studio-mannequin-state-v12 / state-v1` stores one canonical body-and-pose snapshot with a 24 KiB
  UTF-8 budget.
- `studio-bg3d-lt-user-presets-v12 / library-v1` stores up to 32 strict LT presets within 64 KiB.
- Mannequin close waits for SQLite. A rejected write keeps the dialog open, preserves the current
  in-memory state, and exposes JSON export with `현재 탭 메모리 임시 · 새로고침 시 사라짐`.
- BG3D LT hydration and writes are asynchronous. Mutations publish a complete optimistic snapshot,
  queue writes by invocation order, ignore stale generations, and retain a visibly ephemeral
  in-memory snapshot after failure.
- Corrupt, future, unknown-field, oversized, count-overflow and noncanonical SQLite rows fail closed
  without being rewritten as empty.
- Existing mannequin JSON import/export remains explicit. Existing localStorage key helpers are not
  imported by either product default path.

## Quality verdict

The storage choice does not claim a renderer-quality gain. Its quality contribution is semantic:
body dimensions, joint rotations, pelvis offset, line settings and tone settings survive the exact
canonical schema rather than being partially ignored or silently truncated. Render and brush
quality gates remain owned by their engine lanes.

## Production browser verdict

Chromium 140 loaded the minified Vite build in a module Dedicated Worker, opened only the shared
`toonspectrum-studio-sqlite/studio-local-v12.db` SAH-pool authority, and completed 100 saves plus
100 loads for each maximum canonical fixture. The 1,307-byte mannequin row and 28,447-byte LT row
retained exact canonical SHA-256 values through graceful close/reopen and through forced Worker
termination followed by a new Worker. Memory VFS opens and localStorage reads/writes/fallbacks were
all zero. Console, page, request, HTTP and CSP diagnostic arrays were empty.

## Quarantine

- Dedicated Worker/WASM peak memory is unmeasured because both browser memory APIs were unexposed;
  the raw report stores `null`, not an estimate.
- Termination before/during a transaction, full tab/process kill, quota exhaustion, Safari/Firefox
  and Windows/Linux matrices are unmeasured. Committed-write Worker termination is measured pass.
- 8h/24h alternating save/load/delete soak and true multi-tab semantic conflict UX remain pending.
- Pre-V12 key auto-migration is intentionally not implemented.
