# VRM asset SQLite/OPFS license and deployment

## Components

| Component | Version / source | License and notice | Deployment role |
| --- | --- | --- | --- |
| SQLite core | 3.53.0 through the existing repository pin | Public domain upstream | Shared manifest database and KV transaction engine |
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, existing install | Package declares Apache-2.0; preserve packaged license/notice and existing SBOM pin | Browser WASM bridge and OPFS SAH-pool backing for `studio-local-v12.db` |
| OPFS and File System Access primitives | Browser Web Platform | No bundled third-party license | Immutable content-addressed model/PNG bytes and commit markers |
| ToonSpectrum OPFS asset store and VRM repository | Repository source | Project license | SHA-256 CAS index, owner references, canonical schemas, validation and lifecycle fencing |

No package, lockfile, native binary, model, texture corpus, external renderer or copyleft dependency
is added by this change. Runtime Three.js/VRM objects are not stored.

## Deployment boundary

```text
/studio creator chunk
  -> existing acquireStudioLocalDatabase()
  -> toonspectrum-studio-sqlite/studio-local-v12.db
       ├─ studio-vrm-model-assets-v12 / manifest-v1
       └─ studio-vrm-texture-paint-assets-v12 / manifest-v1

/studio creator chunk
  -> native navigator.storage OPFS
  -> toonspectrum-studio-vrm-assets-v12
       ├─ content-addressed blobs
       ├─ strict commit markers
       └─ CAS index/owner references
```

The product repository acquires the existing app-lifetime SQLite handle. It does not open another
database filename and does not close the shared handle when a panel unmounts. The dedicated VRM
asset OPFS root isolates large binaries from the SQLite SAH-pool files while keeping both under the
same origin and V12 destruction/recovery policy.

Memory VFS and injected OPFS fakes are test/fault-injection facilities only. Native OPFS absence is
a product error. A valid current asset may remain explicitly labelled current-tab memory, but that
state is not a durable authority and cannot produce a portable project attachment.

## Legacy and data policy

- The former VRM and texture-paint IndexedDB databases are not opened, enumerated, copied or
  migrated by product defaults.
- Existing helper code remains only behind an explicitly supplied test/embed `IDBFactory`.
- A user-selected `.vrm`/`.glb` file is a new import, not legacy database migration; it must pass
  current structural, byte, MIME, count and hash gates before publication.
- SQLite stores canonical manifests only. It does not store full binary base64, Canvas pixels,
  object URLs, renderer state, credentials or remote URLs.
- Assets remain same-origin local unpublished creative data. This repository performs no upload,
  telemetry or cross-device synchronization. OPFS is not a backup.

## CSP and browser requirements

Deployment already requires the installed sqlite-wasm assets and the repository's existing CSP
allowances. The new repository adds no network origin and no dynamic third-party code. Native OPFS
requires `navigator.storage.getDirectory`; production must fail closed when policy, private mode or
browser support denies it. Browser-specific quota and eviction behavior must be measured rather than
assumed.

## Release checklist

- [x] Reuse `studio-local-v12.db`; no package or lockfile change.
- [x] OPFS SHA-256 CAS for large bytes; no full binary base64 in SQLite.
- [x] Strict commit marker, verified read and manifest-last visibility transition.
- [x] Canonical schema/version/MIME/hash/count/byte bounds and whole-manifest fail-closed reads.
- [x] Bounded orphan cleanup with live-hash protection and grace/observation fencing.
- [x] Same-realm operation serialization, manifest generation check and close fence.
- [x] Product defaults contain no automatic legacy IndexedDB read.
- [x] Durable failure is visible and memory-only state is explicitly ephemeral.
- [ ] Record native Chromium OPFS p50/p95/p99 and peak-memory raw data.
- [ ] Complete quota, eviction, abrupt termination, multi-tab and OS/browser matrix.
- [ ] Complete 8h/24h soak before durability promotion is reported as fully hardened.
- [ ] Keep the SQLite wrapper version/license and generated assets in the repository-wide
  NOTICE/SBOM/integrity gate.
