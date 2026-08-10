# Production Bible SQLite benchmark plan and measured result

## Reproduction

```bash
pnpm exec tsx tests/benchmarks/harness/production-bible-sqlite-opfs-browser.ts
pnpm exec vitest run tests/visual/production-bible-sqlite-opfs-browser-contract.test.ts
```

The standalone harness builds a production Vite bundle with a module Dedicated Worker,
sqlite wasm, and the existing async proxy/Worker assets. It serves the build on a unique
loopback origin with COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, and a
restrictive `wasm-unsafe-eval` CSP. Playwright launches headless Chromium with a clean
origin and no package or application configuration change.

Raw evidence:
`tests/benchmarks/results/production-bible-sqlite-opfs-browser.json`.

## Measured environment

- Date: 2026-08-09 KST (`generatedAt` 2026-08-08T20:34:27.055Z).
- Chromium: 140.0.7339.186.
- SQLite: `@sqlite.org/sqlite-wasm` 3.53.0-build1.
- Execution: production Vite bundle, cross-origin-isolated module Dedicated Worker,
  OPFS SAH-pool.
- Logical DB: `/studio-local-v12.db`.
- Namespace: `studio-production-bible-v12`.

## Results

| Operation | p50 | p95 | p99 | Samples |
|---|---:|---:|---:|---:|
| Canonical 1,010-byte save | 2.450ms | 2.885ms | 3.685ms | 60 |
| Strict canonical load | 0.240ms | 0.385ms | 1.465ms | 60 |

- sqlite-wasm initialization: 29.740ms.
- Cold OPFS open: 31.565ms.
- Normal close/reopen: 0.445ms.
- Forced Worker termination, new Worker DB reopen: 9.215ms.
- Full terminate + fixed 250ms wait + Worker startup/recovery envelope: 319.830ms.
- OPFS physical files: 6 files, 204,800B.
- Browser storage estimate: 206,162B filesystem usage of 2,154,780,842B quota.
- Canonical SHA-256:
  `54f5dda0c051309e77d14c4e7039d635aa295ddc638b4432ec13f646a2e935df`.
- Save/load mismatches: 0.
- Console errors/warnings, page errors, failed requests, HTTP error responses: 0/0/0/0/0.
- Worker/page CSP violations: 0/0.

## Gates

- The option-free product factory must be used after shared runtime acquisition.
- Exactly two normal OPFS opens must target `/studio-local-v12.db`; memory DB opens must
  remain zero.
- The namespace must be exactly `studio-production-bible-v12`.
- Raw pre-close JSON, reopened JSON, and their SHA-256 must match.
- All 60 saves and 60 loads must retain raw samples whose p50/p95/p99 recompute by the
  nearest-rank-ceil method.
- Owner and work scope changes must address distinct documents and recover the expected
  canonical value after reopen.
- A poison v1 key must not be read through the corresponding v12 scope and must remain
  untouched.
- Corrupt and noncanonical rows must fail closed.
- SAH installation and quota fault injection must not use IndexedDB/localStorage or claim
  persistence.
- The termination seed Worker must not call close before `worker.terminate()`; a new
  Worker must reopen exact bytes.
- Production assets must include sqlite wasm; response isolation headers and diagnostics
  must remain clean.

## Quarantine

Chromium does not expose a portable page/Worker API for assigning a tiny quota to the
current origin. `navigator.storage.estimate()` is observational, not a quota control.
The committed report therefore distinguishes a passed synthetic `QuotaExceededError`
boundary test from actual browser-enforced quota exhaustion, which remains quarantined.
No success claim is made for OS disk-full behavior or vendor-specific quota eviction.

Worker termination recovery is measured, but browser-process kill/power-loss durability
is not equivalent to Worker termination and remains a broader storage-recovery soak gate.
