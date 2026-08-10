# VRM asset SQLite/OPFS capability survey

Date: 2026-08-09

Subsystem: VRM/GLB model library, model thumbnails, and VRM texture-paint PNG artifacts

## Decision context

VRM models and painted textures are durable user creative assets. They are too large for SQLite
`TEXT` base64 rows, and their stable identity is the SHA-256 of the original bytes. The selected
design therefore combines the existing shared `studio-local-v12.db` authority for strict canonical
manifests with a dedicated OPFS content-addressed blob root. The product path does not open or read
the pre-V12 IndexedDB databases. `LEGACY_DATA_MIGRATION=FALSE` permits only an explicit user-selected
file import through the normal VRM validation boundary.

Storage quality in this table means exact byte, MIME, content-identity and schema preservation. No
rendered-pixel quality claim is inferred from a storage roundtrip. Chromium 140 latency below is a
real production Vite asset running the product repository in a Dedicated Worker against SQLite's
OPFS SAH-pool and the native OPFS CAS. Worker/aggregate peak memory remains unmeasured because the
browser did not expose a trustworthy worker memory facility; no estimate replaces that gap.

## Candidate comparison

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared `@sqlite.org/sqlite-wasm` manifest + OPFS SHA-256 CAS | Reuses the app-lifetime V12 database; keeps large identity bytes out of SQL; manifest-last visibility, verified commit marker, deduplication and bounded orphan reclamation | Boundary-specific crash injection, quota eviction, multi-tab ownership, other browser/OS matrices and long soak remain | Original VRM/PNG bytes are returned only after SHA-256, length and MIME verification; no renderer object is serialized | Chromium 140: 1 MiB save **16.490/18.690/19.480 ms**, load **7.685/9.245/9.750 ms**; 32 MiB save **259.360/260.170/260.170 ms**, load **202.070/208.580/208.580 ms**; PNG save **11.095/12.285/12.515 ms**, load **3.275/3.580/3.905 ms** | Worker/aggregate peak **unmeasured**; measured page `usedJSHeapSize` snapshots: 659,811 B baseline to 1,464,104 B after recovery | Production assets: repository Worker 299,954 B; SQLite WASM 864,752 B; SQLite worker 210,936 B; OPFS proxy 32,289 B; page entry 4,120 B | Canonical exact-field JSON, sorted manifests, lowercase SHA-256 and generation fencing; 202/202 assets exact after reopen | SQLite public domain; installed wrapper Apache-2.0; Web Platform OPFS | Low: existing `acquireStudioLocalDatabase()` and OPFS asset store | Medium: browser quota/eviction and cross-tab policy still need operational evidence | **Selected product authority; Chromium 140 promotion gate passed** |
| Legacy dedicated IndexedDB Blob stores | Browser-native Blob storage and existing test fixtures | Splits lifecycle, migration, corruption and deletion authority from V12 SQLite; old rows do not carry the new commit-marker contract | Blob bytes can be lossless when rows are valid, but historical metadata/byte drift needs bespoke repair | Not rerun; no promotion evidence | Unmeasured | Browser built-in | Per-transaction only; cross-database authority is not deterministic | Web Platform API | Medium/high | High because it preserves parallel durable authority | **Explicit test/embed seam only; product default never opens it** |
| SQLite `TEXT` rows containing full base64 binaries | One database and transactional row visibility | About 33% base64 expansion, giant JSON parsing/copies, DB bloat, vacuum cost and main/worker memory spikes | Byte-decodable but storage amplification adds no quality | Rejected before benchmark | Expected high; not measured | No new dependency, but large WASM/JS boundary copies | Canonical base64 is possible | Same SQLite licenses | Low API cost, very high payload-copy cost | High for 128 MiB models and aggregate catalogs | **Rejected** |
| Raw OPFS blobs plus JSON manifest files only | Efficient large-file I/O and simple content addressing | Must invent locking, index transactions, schema migration, diagnostics and product-wide lifecycle outside the shared database | Exact bytes are possible | Unmeasured | Unmeasured | Web API only | Requires a custom canonical/locking protocol | Web Platform API | Medium | High bespoke authority maintenance | OPFS is retained for bytes, but raw JSON is **not** the metadata authority |
| Current-tab memory | Keeps an already validated user-selected model usable after durable storage fails | Lost on reload; cannot be exported as a durable library reference or reported as saved | Exact bytes survive only for the tab lifetime | Not applicable | Bounded by current UI state | None | Process-lifetime only | Application code | Low | High if mislabeled as durable | **Explicit emergency state only, visibly ephemeral and portable insert blocked** |

## Implemented product paths

- `src/domains/creator/vrm-library.ts`
  - default list/get/save/delete/thumbnail operations use the SQLite/OPFS repository;
  - `legacyIndexedDb` is an explicit injected test/embed seam and is never auto-probed;
  - GLB/VRM structure and SHA-256 are validated before publication.
- `src/domains/creator/studio-vrm-texture-paint-library.ts`
  - default artifact save/get uses the same durable repository;
  - receipt, PNG structure, dimensions, byte count and SHA-256 are revalidated on read;
  - `indexedDb` remains an explicit pre-V12 test seam only.
- `src/domains/creator/StudioVrmPoser.tsx`
  - the shipped `/studio` VRM model and texture-paint flows call those defaults;
  - an unavailable durable authority is surfaced as current-tab memory, never a silent save;
  - a memory-only model cannot be inserted as a portable project reference.
- `src/domains/creator/StudioVrmCharacterLibraryPanel.tsx`
  - differentiates `SQLite/OPFS` and `현재 탭 임시` sources in product UI.

## Bounds and rejection policy

- Models: at most 512, 128 MiB each, 16 GiB aggregate, `model/gltf-binary` only.
- Model/sample thumbnails: PNG, JPEG or WebP; 2 MiB each; at most 512 sample thumbnails.
- Texture-paint artifacts: at most 128, 96,000,000 bytes each and aggregate, PNG MIME only.
- Each SQLite manifest: at most 4 MiB UTF-8 canonical JSON.
- IDs, NFKC names, timestamps, safe integers, exact object keys, schema/kind/version, MIME,
  byte length and lowercase SHA-256 are strict. Unknown, future, duplicate, corrupt, pretty-printed
  or otherwise noncanonical data rejects the entire manifest. No partial salvage is presented as a
  complete library.
- Three.js, VRM runtime, Canvas, ImageBitmap, object URL, data URL and other renderer objects are not
  accepted by the repository model.

## Current evidence and quarantine

The focused suite uses the installed real sqlite-wasm engine with `vfs: "memory"` and an injected
OPFS filesystem fake. It covers byte-exact roundtrip, hash/marker corruption, torn writes, bounded
orphan cleanup, cross-instance races, generation checks, close/reopen and product source contracts.
The external promotion harness adds a production Vite build and Chromium 140.0.7339.186 Dedicated
Worker using the real product factory, real SQLite OPFS SAH-pool and real OPFS CAS. Raw evidence is
`tests/benchmarks/results/vrm-asset-sqlite-opfs-browser.json`; reproduce it with:

```sh
pnpm exec tsx tests/benchmarks/harness/vrm-asset-sqlite-opfs-browser.ts
```

### Chromium 140 external promotion evidence

| Workload | Samples | p50 | p95 | p99 | Integrity |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 MiB deterministic VRM-like GLB save | 100 | 16.490 ms | 18.690 ms | 19.480 ms | 100 saved, mismatch 0 |
| 1 MiB deterministic VRM-like GLB load | 100 | 7.685 ms | 9.245 ms | 9.750 ms | 100 loaded, mismatch 0 |
| 32 MiB deterministic VRM-like GLB save | 2 | 259.360 ms | 260.170 ms | 260.170 ms | exact 33,554,432 B, mismatch 0 |
| 32 MiB deterministic VRM-like GLB load | 5 | 202.070 ms | 208.580 ms | 208.580 ms | exact SHA/bytes, mismatch 0 |
| 256 x 256 authored PNG save | 100 | 11.095 ms | 12.285 ms | 12.515 ms | 22,452,597 B aggregate, mismatch 0 |
| 256 x 256 authored PNG load | 100 | 3.275 ms | 3.580 ms | 3.905 ms | 100 loaded, mismatch 0 |

- Normal close/reopen verified all 102 models and 100 textures byte-for-byte and SHA-for-SHA.
- Physical OPFS inspection found 202 blobs, 202 commit markers, 405 CAS files totaling
  194,538,878 B, plus six SQLite SAH-pool files totaling 409,600 B.
- The canonical model and texture manifests were 44,389 B and 50,200 B. Neither contained base64,
  a data URL, a GLB base64 prefix or a PNG base64 prefix.
- Product fallback counters were all zero: memory database 0, memory filesystem 0, localStorage
  reads/writes 0/0 and IndexedDB open/delete 0/0.
- A Worker was terminated after acknowledged durable writes without calling `close()`. A fresh
  Worker reopened `/studio-local-v12.db` in 29.095 ms and recovered the 1 MiB model and PNG with
  exact SHA/bytes; the full recovery observation including the deliberate 750 ms wait was
  867.190 ms.
- Storage usage was measured at 195,064,872 B after work and remained identical after reopen. The
  measured quota was 1,724,985,337 B.
- Chromium exposed page JS heap snapshots only: `usedJSHeapSize` was 659,811 B at baseline,
  1,452,100 B after the normal Worker, and 1,464,104 B after termination recovery. Worker snapshots
  were explicitly unavailable and `measureUserAgentSpecificMemory()` raised `SecurityError`, so
  no worker or aggregate peak is claimed.

Still quarantined:

- worker/WASM/aggregate peak memory on a browser exposing a trustworthy measurement facility;
- Safari/Firefox and Windows/Linux device coverage;
- real quota exhaustion/eviction, termination at every blob/marker/manifest boundary, abrupt tab or
  browser-process termination, and power-loss simulation;
- two-tab conflict behavior and Web Locks/worker ownership policy under real SAH-pool deployment;
- 128 MiB single-model and maximum-catalog device pressure;
- 8h/24h close/reopen, replace, delete and orphan-cleanup soak.
