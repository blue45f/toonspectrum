# BG3D library SQLite/OPFS benchmark and fault plan

## Committed focused gates

Run the new authority and existing consumer regressions with:

```bash
pnpm exec vitest run \
  src/domains/creator/studio-bg3d-libraries-sqlite-opfs.test.ts \
  src/domains/creator/bg3d-model-library.test.ts \
  src/domains/creator/bg3d-template-library.test.ts \
  src/domains/creator/studio-bg3d-asset-metadata-store.test.ts \
  src/domains/creator/StudioBg3dAssetLibraryPanel.test.tsx \
  src/domains/creator/studio-bg3d-project-library.test.ts \
  src/domains/creator/studio-bg3d-canonical-glb-download.test.ts \
  src/domains/creator/studio-bg3d-model-thumbnail-capture.test.ts \
  src/domains/creator/studio-hybrid-dcc-bg3d-handoff.test.ts
```

The V12 cases cover real sqlite-wasm, fake deterministic OPFS, close/reopen, exact GLB restoration,
thumbnail CAS separation, SHA-256 tampering, torn/future/noncanonical data, concurrent queueing,
commit failure, quota failure, bounded orphan cleanup, deletion evidence, and legacy-not-read. Root
TypeScript, changed-file ESLint, and `git diff --check` are separate required gates.

## Chromium 140 OPFS promotion measurement

Run the production-bundled benchmark and its tracked-result contract with:

```bash
pnpm exec tsx tests/benchmarks/harness/bg3d-libraries-sqlite-opfs-browser.ts
pnpm exec vitest run tests/visual/bg3d-libraries-sqlite-opfs-browser-contract.test.ts
```

The committed artifact is
`tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json`. It was measured on 2026-08-09
KST using Headless Chromium 140.0.7339.186 on macOS, 12 exposed logical CPUs and 8 GiB exposed
device memory. Vite produced 13 production files in 508.2017 ms: 5,075,266 bytes including source
maps, a 426,725-byte BG3D benchmark Worker, 864,752-byte sqlite3 WASM, and the product GLB
validation Worker. CSP, COOP, COEP, and CORP were active; console errors/warnings, page errors,
failed requests, HTTP error responses, and CSP violations were all zero.

### Measured latency

All values are milliseconds. Distributions retain every raw sample and use nearest-rank-ceil.

| Operation | Samples | p50 | p95 | p99 | Max | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 MiB GLB verified CAS read | 100 | 5.395 | 7.255 | 7.790 | 10.270 | 0 mismatches |
| 32 MiB GLB verified CAS read | 100 | 138.575 | 140.865 | 142.550 | 145.205 | 0 mismatches |
| 100 MiB GLB verified CAS read | 5 | 421.615 | 432.315 | 432.315 | 432.315 | 0 mismatches |
| Template canonical write, growing to 100 rows | 100 | 20.410 | 34.550 | 35.895 | 36.165 | 100 rows |
| Template full list at 100 rows | 100 | 22.560 | 24.010 | 24.495 | 27.210 | 0 mismatches |
| Metadata canonical write, growing to 100 rows | 100 | 6.575 | 7.360 | 7.635 | 7.700 | 100 rows |
| Metadata exact-hash get at 100 rows | 100 | 0.755 | 0.890 | 1.135 | 3.755 | 0 mismatches |

Single physical writes were 32.220 ms at 1 MiB, 514.585 ms at 32 MiB, and 1,636.755 ms at the
exact 100 MiB product ceiling. Their expected SHA-256, manifest content hash, returned Blob bytes,
physical OPFS CAS size, and physical CAS SHA-256 were equal. The 100 MiB lane ran because Chromium
reported 8 GiB device memory and 2,177,558,229 bytes of initial quota, exceeding the 768 MiB safety
gate. Running 100 independent physical writes at 32/100 MiB would deliberately allocate at least
3.2/10 GiB, so only verified read distributions use 100 samples; the 100 MiB read uses five samples.

Cold shared SQLite open was 61.355 ms and same-Worker logical close/reopen was 0.795 ms. The real
browser exposed the reopen defect in `studio-local-database-runtime.ts`: recreating sqlite-wasm
also recreated the SAH-pool VFS while its prior SyncAccessHandles remained owned. Reusing the same
initialized sqlite API for the app lifetime fixed the defect without changing schema or database
implementation. Its focused runtime and BG3D authority regressions pass.

### Durability, fencing, and fallback receipts

- The SQLite model/template/metadata manifests were canonical and measured 3,512 / 246,721 /
  38,494 bytes. Neither they nor the CAS index contained a base64 payload or data URL.
- The deterministic thumbnail was a separate 58-byte OPFS CAS object and remained byte-identical
  after reopen.
- A Worker committed a deterministic 1 MiB model in 122.700 ms, deliberately did not close its
  SQLite handle, and was force-terminated. A fresh Worker reopened and verified exact SHA and bytes
  in 64.315 ms.
- A first Dedicated Worker held the product Web Lock for 250 ms. A second Worker's actual default
  metadata authority waited 250.515 ms, committed successfully, and a fresh Worker observed the
  row. No lost update occurred.
- Two live Workers cannot each own a SQLite SAH-pool VFS over the same pool in this Chromium build.
  The exploratory direct dual-authority attempt waited on the product lock, then Chromium rejected
  the second VFS with `NoModificationAllowedError` because the first Worker's VFS retains
  SyncAccessHandles for its Worker lifetime. This dimension is explicitly infeasible, not reported
  as a successful dual-connection test; the product architecture must retain one storage Worker.
- Instrumented accesses were exactly zero for IndexedDB, localStorage, memory SQLite, and memory CAS
  across all Workers. No ambient legacy database was read.
- OPFS usage increased from 0 to 140,260,121 bytes. The inspected product directories contained 11
  files totaling 140,257,087 bytes.
- Worker memory APIs were not exposed and are recorded as `null`. The page exposed
  `performance.memory` (681,252 to 1,400,196 used JS heap bytes); user-agent-specific memory was not
  exposed and is `null`. No substitute estimate is used.

### Remaining browser/device gates

The following remain explicitly unmeasured rather than inferred from this pass:

- 1/128/512-model catalog scaling, maximum-size thumbnails/templates, 1,000/4,096 metadata rows;
- duplicate CAS/orphan sweep at 128/1,024/2,048 objects and true OPFS quota exhaustion;
- termination between CAS write and manifest publication, full Chromium process kill, browser
  crash, OS power loss, and hardware fsync semantics;
- real two-tab application coordination (the measured contention uses Dedicated Workers);
- Worker/SQLite WASM/ArrayBuffer peak memory where Chromium exposes no API;
- Windows, Linux, mobile, Safari, Firefox, low-memory and low-quota devices;
- 8-hour and 24-hour save/list/reopen/delete soak.

Promotion for the dimensions measured here requires zero partial manifests, exact byte/hash
identity after reopen, zero lost updates, zero fallback accesses, and an explicit failure whenever
durable storage is unavailable. The tracked contract enforces those receipts and broad latency
ceilings without replacing the raw distributions.

## Quality and interoperability gates

Persistence cannot establish CSP superiority. Release evidence must also run restored GLBs through
the existing GLB admission and rendering corpus, compare pre/post-restoration screenshots and
depth/normal/ID passes, and execute physical GPU/device, P3/HDR, CSP/Photoshop round-trip, and target
browser matrices. Those gates remain unmeasured and are not marked complete by the Chromium
persistence pass.
