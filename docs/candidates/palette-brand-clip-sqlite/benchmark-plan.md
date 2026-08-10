# Palette, Brand Kit, and saved clip SQLite benchmark plan

## Completed correctness gate

The focused suite uses the installed `@sqlite.org/sqlite-wasm` package rather than a KV
mock:

```bash
pnpm exec vitest run \
  src/domains/creator/studio-palette-sqlite-repository.test.ts \
  src/domains/creator/studio-brand-kit-sqlite-repository.test.ts \
  src/domains/creator/studio-saved-clip-sqlite-repository.test.ts \
  src/domains/creator/studio-palette-brand-clip-sqlite-authority-contract.test.ts \
  src/domains/creator/StudioPaletteLibraryPanel.test.tsx \
  src/domains/creator/StudioBrandKitPanel.test.tsx
```

The repository tests call `openStudioLocalDatabase({ vfs: "memory" })`, execute real SQL,
and close each real database. They cover exact canonical round trips, corrupt and
noncanonical envelopes, duplicate/unknown fields, lossy clip JSON, hard item limits,
unchanged prior values on rejection, overlapping mutation order, and unavailable VFS
errors. These are correctness measurements, not browser latency measurements.

## Required browser OPFS benchmark

Build a production Vite module Dedicated Worker harness that calls the option-free
product repositories after registering the shared runtime. Use a clean loopback origin,
the existing COOP/COEP/CORP policy, and the real OPFS SAH-pool. Record raw samples rather
than only aggregate values.

For each namespace, measure at minimum:

- cold sqlite-wasm initialization and first `/studio-local-v12.db` open;
- 100 canonical saves and 100 strict loads at small, representative, and near-limit
  payload sizes;
- p50/p95/p99 with a documented nearest-rank method;
- one queued burst of 20 mutations and final invocation-order equality;
- normal close/reopen and exact canonical SHA-256 recovery;
- forced Worker termination after a committed receipt, followed by a new Worker reopen;
- OPFS file count/bytes and `navigator.storage.estimate()` before/after;
- Worker heap/WASM memory where the browser exposes a reliable API;
- page/Worker console errors, CSP violations, failed requests, and HTTP error responses.

Creative-quality gates are byte/semantic rather than visual: palette order and colors,
Brand Kit references/fonts/logo bytes, and every clip JSON node must match exactly after
reopen. A visual smoke can render a representative saved clip, but it cannot replace the
canonical equality gate.

## Fault matrix

| Fault | Required injection | Passing behavior |
|---|---|---|
| SAH-pool install/open failure | Throw at the real shared database acquisition boundary | Explicit unavailable state; no localStorage/IDB read |
| Durable write rejection | Reject `kvSet` after model validation | Accepted change is visibly current-tab memory only |
| Corrupt/noncanonical row | Write poison bytes directly under one V12 namespace | Whole library rejected; other namespaces unchanged |
| Item/byte overflow | Build exactly-limit and limit+1 values | Limit value round-trips; +1 rejects with prior bytes unchanged |
| Worker termination | Terminate after committed save receipt, before close | New Worker reopens exact bytes |
| Multi-tab overlap | Two tabs mutate the same namespace under an explicit test protocol | Do not call complete until a documented semantic conflict policy exists |
| Actual quota exhaustion | Browser-controlled quota or reproducible filesystem fixture | Error surfaced; no fallback, eviction, or truncation |

## Explicitly unmeasured gates

As of this slice, browser OPFS p50/p95/p99, peak Worker/WASM memory, normal close/reopen,
forced Worker termination, browser-process crash/power-loss behavior, actual quota
exhaustion, OPFS eviction, and multi-tab conflict semantics have not been run specifically
for these three namespaces. Existing shared-database measurements from other features
are useful priors but are not copied here as if they measured palette, Brand Kit, or clip
payload distributions.
