# VRM asset SQLite/OPFS benchmark and verification plan

## Automated evidence implemented now

The focused Vitest suite opens the installed real `@sqlite.org/sqlite-wasm` runtime with
`openStudioLocalDatabase({ vfs: "memory" })` and injects an OPFS filesystem fake at the repository
boundary. It verifies:

- VRM model, model/sample thumbnail and texture PNG byte-exact roundtrip;
- SQLite manifests contain hashes and metadata but not a base64 copy of the binary;
- same-content deduplication and close/new-repository reopen semantics;
- SHA-256 mismatch, truncated/corrupt blob, corrupt/missing commit marker and corrupt/future,
  unknown-field or noncanonical manifest rejection;
- a torn blob/marker or failed SQLite manifest write never becomes logically visible;
- bounded orphan reclamation, grace/second-observation behavior and live-reference preservation;
- invocation ordering and generation progression across concurrent repository instances;
- unavailable shared SQLite/OPFS fails closed with explicit current-tab-memory semantics;
- product defaults do not open the injected legacy IndexedDB seam.

These tests establish state-machine and corruption behavior. Node memory-VFS timing is not a proxy
for browser OPFS and is not reported as p50/p95/p99.

## Executed Chromium 140 production gate

The external harness builds a dedicated Vite production asset, serves it with cross-origin
isolation headers and runs the product `StudioVrmAssetSqliteOpfsRepository` inside an actual
Chromium 140.0.7339.186 Dedicated Worker. It calls `acquireStudioLocalDatabase()` with `vfs: "opfs"`,
opens `/studio-local-v12.db` through the real SQLite OPFS SAH-pool, and uses the repository's native
OPFS content-addressed store. The repository factory receives no storage substitute.

Raw artifact: `tests/benchmarks/results/vrm-asset-sqlite-opfs-browser.json`

Reproduction command:

```sh
pnpm exec tsx tests/benchmarks/harness/vrm-asset-sqlite-opfs-browser.ts
```

| Workload | Samples | p50 | p95 | p99 | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 MiB VRM-like GLB save | 100 | 16.490 ms | 18.690 ms | 19.480 ms | 100 success, 0 mismatch |
| 1 MiB VRM-like GLB load | 100 | 7.685 ms | 9.245 ms | 9.750 ms | 100 success, 0 mismatch |
| Exact 32 MiB VRM-like GLB save | 2 | 259.360 ms | 260.170 ms | 260.170 ms | 2 success, 0 mismatch |
| Exact 32 MiB VRM-like GLB load | 5 | 202.070 ms | 208.580 ms | 208.580 ms | 5 success, 0 mismatch |
| 256 x 256 PNG save | 100 | 11.095 ms | 12.285 ms | 12.515 ms | 100 success, 0 mismatch |
| 256 x 256 PNG load | 100 | 3.275 ms | 3.580 ms | 3.905 ms | 100 success, 0 mismatch |

The 32 MiB lane was feasible and completed at exactly 33,554,432 B; no quarantine or workload
weakening was used. Two physical saves and five verified loads bound disk traffic, while the 1 MiB
lane supplies the requested 100 save and 100 load observations.

Normal close/reopen verified 102 models and 100 textures with exact SHA-256 and byte equality. The
model and texture manifest digests remained stable, their canonical JSON contained no base64 or
data URL, and the physical CAS contained exactly 202 blobs plus 202 commit markers. Measured OPFS
usage was 195,064,872 B after work and unchanged after reopen; CAS files totaled 194,538,878 B and
SQLite SAH-pool files totaled 409,600 B.

The fault lane terminated a Worker after it acknowledged complete durable model and texture saves,
without calling `close()`. A new Worker reopened in 29.095 ms and recovered both assets with exact
SHA/bytes and canonical manifests. This proves committed-state recovery after abrupt Worker death;
it does **not** replace boundary-specific termination injection during blob, marker and manifest
writes.

Fallback instrumentation observed memory-database opens 0, memory-filesystem fallback 0,
localStorage reads/writes 0/0 and IndexedDB open/deleteDatabase 0/0. The production asset receipts
pin the benchmark Worker at 299,954 B, SQLite WASM at 864,752 B, SQLite's worker at 210,936 B, its
OPFS proxy at 32,289 B and the page entry at 4,120 B.

Memory reporting is measured-only. Chromium exposed page `performance.memory` snapshots:
659,811 B `usedJSHeapSize` at baseline, 1,452,100 B after the normal Worker and 1,464,104 B after
termination recovery. Worker memory fields were unavailable, and
`measureUserAgentSpecificMemory()` returned `SecurityError`; therefore worker/WASM/aggregate peak
memory remains `unmeasured`, with no estimate substituted.

## Remaining browser promotion matrix

Use a production Vite build and the exact product `acquireStudioLocalDatabase()` plus native OPFS
filesystem. Do not replace either storage half with an in-memory map. Record raw JSON under
`tests/benchmarks/results/` with browser build, OS, device, storage medium, quota estimate, warm-up,
sample count and exact source revision.

| Workload | Corpus | Iterations | Required metrics |
| --- | --- | ---: | --- |
| Cold/warm catalog | Empty, 128 and 512 model entries | 30 cold opens; 500 warm lists | open/list p50/p95/p99, long tasks, SQLite/OPFS physical bytes |
| VRM save/read extension | 128 MiB valid GLB/VRM files | 50, fewer only when raw artifact records why | validation, SHA-256, write, manifest commit and verified read p50/p95/p99; measured JS/WASM/worker memory where available |
| Deduplicated model save | Same 128 MiB hash and distinct metadata attempts | 100 | dedup latency, extra physical bytes, no metadata identity drift |
| Thumbnail save/read | PNG/JPEG/WebP near 2 MiB | 300 | p50/p95/p99, MIME/hash equality, decode-free storage overhead |
| Texture paint | Representative PNGs up to 96,000,000 bytes and 128-entry catalog | 100 mixed writes/reads | p50/p95/p99, receipt revalidation, peak memory, aggregate rejection latency |
| Cleanup | 10,000 synthetic orphan paths with 512 live hashes | 100 calls at bounds 1/32/256 | per-call latency, reclaimed bytes, event-loop/worker jank, zero live deletion |
| Close/reopen | Mixed maximum catalog | 1,000 cycles | canonical manifest digest, blob digest, marker equality, failure count |

Peak memory must come from a real browser measurement facility when available. If the browser cannot
provide a trustworthy number, record `null` and the limitation; do not substitute an estimate.

## Crash and corruption matrix

Inject termination or write failure at each durable boundary:

1. before OPFS blob create;
2. after partial blob bytes;
3. after complete blob but before verified read;
4. before/during/after commit-marker write;
5. before/during/after owner-reference update;
6. before/during/after SQLite manifest write;
7. after manifest write but before exact reread;
8. during delete and during bounded orphan cleanup.

After every fault, reopen a fresh repository and require exactly one of two states: the old complete
manifest, or the new complete manifest with a matching marker and hash-verified blob. No third
partial state may be returned.

Also test:

- physical byte mutation, marker field mutation, deleted marker/blob and SQLite row corruption;
- quota exhaustion at blob, marker and SQLite phases;
- browser storage eviction and denied/policy-disabled OPFS;
- two tabs saving different and identical hashes, closing one tab mid-operation, and stale
  generation conflicts;
- Worker/tab crash, browser restart and OS restart where the harness supports it;
- 8h and 24h mixed save/read/delete/replace/cleanup soak.

## Product and quality gates

- Zero product calls to legacy IndexedDB on boot, list, save, load, thumbnail, texture restore or
  delete. An explicit user-selected import is the only old-format ingress.
- Zero base64 model/texture bodies in SQLite rows.
- 100% SHA-256 and byte-count equality after close/reopen and forced faults.
- Zero partial or silently repaired libraries from corrupt/future/noncanonical manifests.
- No durable success label after SQLite or OPFS failure; memory-only source remains visibly
  ephemeral and portable insertion stays blocked.
- Renderer-object serialization count is zero.
- CSP functional comparison remains a separate human/device lab gate; this storage benchmark does
  not claim brush feel or render quality superiority.

## Current status

Real sqlite-wasm functional tests, injected OPFS fault tests, shipped-source wiring contracts and
the Chromium 140 production OPFS promotion gate are implemented. The 1 MiB 100/100 model workload,
32 MiB exact-byte lane, 100/100 PNG workload, normal close/reopen and post-commit Worker termination
all passed with zero SHA/byte mismatch and zero fallback opens. Remaining release gates are
boundary-specific crash injection in a real browser, quota exhaustion/eviction, two-tab ownership,
Safari/Firefox and Windows/Linux coverage, 128 MiB/maximum-catalog pressure, trustworthy
worker/aggregate peak memory and 8h/24h soak.
