# Mannequin and BG3D LT preset SQLite benchmark and verification plan

## Automated evidence implemented

Focused Vitest opens `openStudioLocalDatabase({ vfs: "memory" })`, which initializes the installed
real `@sqlite.org/sqlite-wasm` runtime. The suite verifies:

- both namespaces roundtrip independently in one real SQLite handle;
- missing-row first use and exact canonical bytes;
- corrupt JSON, future versions, unknown fields, pretty/noncanonical text and oversized rows fail
  closed;
- typed mannequin data that would be silently clamped or stripped is rejected;
- overlapping complete-snapshot writes retain invocation order;
- SQLite/OPFS failure is surfaced without browser-storage probing;
- mannequin close waits for save, leaves the panel open on failure, and keeps JSON export visible;
- late hydration cannot overwrite a user edit;
- static product contracts prohibit old-key imports and require the shared SQLite runtime,
  generation fencing and explicit memory-only copy.

The original functional run completed 7 files and 81 tests. The production-browser follow-up ran
the focused product/storage/contract set again: 7 files and 76 tests passed. Node memory-VFS timing
is deliberately not reported as browser OPFS performance.

## Executed Chromium OPFS benchmark

The reproducible command is:

```bash
pnpm exec tsx tests/benchmarks/harness/mannequin-bg3d-preset-sqlite-opfs-browser.ts
```

It creates a minified Vite production bundle, serves it with COOP/COEP/CORP and wasm CSP headers,
and runs a real Chromium 140.0.7339.186 module Dedicated Worker against the pinned sqlite-wasm OPFS
SAH pool. Raw samples and receipts are committed at
`tests/benchmarks/results/mannequin-bg3d-preset-sqlite-opfs-browser.json`.

| Workload | Samples | p50 | p95 | p99 | Canonical bytes / SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| Maximum-structure mannequin save | 100 | 2.305 ms | 2.600 ms | 2.920 ms | 1,307 / `d9d8d7e30309dd47f1e005efdcf5b1db830a275502717149024a3e50f1ece052` |
| Maximum-structure mannequin load | 100 | 0.170 ms | 0.200 ms | 0.230 ms | same bytes and digest after reopen |
| Maximum-schema BG3D LT save | 100 | 8.715 ms | 9.520 ms | 10.655 ms | 28,447 / `74803df944d4b36d9e9d55ee69514a391bcfbae84f43a86a77dff9ab19b6242f` |
| Maximum-schema BG3D LT load | 100 | 4.140 ms | 4.990 ms | 5.270 ms | same bytes and digest after reopen |

The mannequin fixture contains all 19 joints, all 7 body parameters, and all 3 pelvis axes. The LT
fixture contains the maximum 32 presets, each with an 80-character ID, 60-character name and
240-character description. This is the schema-maximum structural payload; the resulting canonical
LT JSON is 28,447 bytes, not a fabricated 64 KiB padded blob.

SQLite wasm initialization was 39.295 ms, cold OPFS open 30.875 ms and graceful close/reopen
0.445 ms. Physical OPFS inspection found 6 files totalling 278,528 bytes. All 400 measured I/O
operations completed with zero semantic mismatch.

## Recovery and diagnostics evidence

- A committed seed Worker was terminated without calling close. A distinct Worker reopened both
  rows in 9.285 ms and reproduced exact canonical bytes, SHA-256 and parsed semantics.
- The full terminate-to-verified-receipt interval, including the deliberate 250 ms separation, was
  331.605 ms.
- OPFS constructors opened only `/studio-local-v12.db`; memory database opens, memory fallback,
  localStorage reads, localStorage writes and localStorage fallback were all exactly zero.
- Chromium reported zero console errors/warnings, page errors, failed requests, HTTP error responses
  and page/Worker CSP violations.
- Dedicated Worker `performance.memory` and `measureUserAgentSpecificMemory` were both unexposed.
  Raw evidence records the values as literal `null`; no peak-memory estimate is claimed.

## Fault matrix

- committed-write Dedicated Worker termination and reopen: **measured pass**;
- termination before or during `kvSet`, full tab/process kill: unmeasured;
- origin quota exhaustion and OPFS write interruption;
- close/reopen after each fault and require the previous or next complete canonical row;
- two tabs mutate the same namespace and expose a conflict rather than pretending to merge;
- unmount/reopen during hydration and each queued write;
- corrupt, future, unknown-field, count-overflow and noncanonical rows;
- 8h and 24h alternating load/save/delete soak.

## Promotion gates

- No automatic read of pre-V12 keys.
- No stale hydration or completion changes product state.
- No UI success copy after a rejected write.
- No partial, silently repaired or silently truncated row.
- Mannequin close failure remains recoverable through visible state and JSON export.
- Browser p50/p95/p99, canonical bytes/digests, graceful reopen, committed-write Worker termination,
  physical OPFS bytes and zero-fallback receipts are measured and passing.
- Peak memory remains unclaimed because both relevant Dedicated Worker APIs were unavailable and
  therefore truthfully recorded as `null`.
