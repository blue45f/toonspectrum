# Translation-memory SQLite benchmark plan

## Executed corpus and command

Raw artifact:
`tests/benchmarks/results/translation-memory-sqlite-opfs-browser.json`

Reproduction command:

```bash
pnpm exec tsx tests/benchmarks/harness/translation-memory-sqlite-opfs-browser.ts
```

The harness creates a fresh Chromium profile through Playwright, builds a production Vite bundle,
serves it from `127.0.0.1` with CSP and cross-origin isolation headers, and executes the TM persistence
inside a module Dedicated Worker. It does not run the SQLite memory VFS and does not expose
localStorage in the Worker.

Corpus and operations:

- 512 approved Korean→English entries across 17 speakers;
- one exact/fuzzy target with a deterministic final translation;
- 30 full canonical saves with sequential edits;
- explicit DB close followed by open of the same OPFS file;
- 50 repeated post-reopen loads;
- exact match, conservative fuzzy suggestion and wrong-target-locale isolation;
- canonical JSON and SHA-256 equality before close and after reopen;
- legacy key and non-V12 namespace negative probes;
- physical recursive OPFS inventory;
- browser console, page error, request failure, HTTP error and CSP violation capture.

## Measured result — 2026-08-09

Environment reported by the artifact:

- Headless Chromium 140.0.7339.186 on macOS;
- 12 logical hardware threads and 8GiB reported device memory;
- `@sqlite.org/sqlite-wasm` 3.53.0-build1;
- Vite production build, module Dedicated Worker;
- exact OPFS root `toonspectrum-studio-sqlite`;
- exact logical DB `studio-local-v12.db`.

| Operation | Samples | p50 | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Save 512-entry / 296,700B canonical document | 30 | **7.965ms** | **13.860ms** | **16.255ms** | 30/30 success |
| Load and fully validate 512 entries after reopen | 50 | **8.715ms** | **9.915ms** | **10.075ms** | 50/50 success, mismatch 0 |

Additional timings:

- sqlite-wasm initialization: 35.865ms;
- cold V12 DB open: 33.630ms;
- close then reopen: **0.535ms**.

Integrity and semantic results:

- 512 expected / 512 reopened, loss 0;
- canonical JSON exact before close and after reopen;
- SHA-256 exact on all three receipts:
  `fa4e5b25cb75891546ac366a7440a5581840cbd51cb6ff89781369da9ff18e66`;
- exact reusable match passed;
- punctuation-normalized fuzzy match score 1.000, `autoApply=false`;
- wrong target locale exact/fuzzy result count 0/0;
- OPFS physical inventory: 6 files, 794,624B;
- exactly two OPFS opens, both `/studio-local-v12.db`;
- memory DB opens 0, localStorage API/fallback 0;
- CSP, browser console, page errors, request failures and HTTP error responses: 0.

## Release gate

A tracked result is passing only when all of the following remain true:

1. Production Vite build includes JS and WASM assets and runs in a real Chromium Worker.
2. Worker, secure context, cross-origin isolation, OPFS and SyncAccessHandle capabilities are true.
3. The namespace is exactly `studio-translation-memory-v12`; the DB is exactly
   `/studio-local-v12.db`; no memory or legacy authority opens.
4. Every raw sample is present and p50/p95/p99 recompute by nearest-rank-ceil.
5. Canonical bytes and SHA-256 are exact across close/reopen.
6. Entry count, exact/fuzzy/language search semantics and `autoApply=false` are preserved.
7. Physical OPFS bytes exist and browser/CSP diagnostics are clean.

## Remaining matrix and fault work

This single-device pass does not claim universal browser parity. Maintain separate evidence for:

- Chromium on Windows/Linux and representative low-memory devices;
- Safari/Firefox capability and explicit unavailable UX where SAH-pool is unsupported;
- quota exhaustion, browser storage eviction and user-cleared site data;
- Worker termination during write and process crash before/after SQLite commit;
- 2,000-entry and 1,000,000-character legal maximum corpus;
- 8h/24h repeated edit/import/export soak;
- cross-device backup/team sync, which OPFS does not provide.

None of these remaining lanes permits silent migration to the previous localStorage key.
