# BG3D shot-batch recovery SQLite/OPFS license and deployment

## Components

| Component | Deployment role | License handling | Bundle/deployment note |
| --- | --- | --- | --- |
| `@sqlite.org/sqlite-wasm` | Shared V12 local metadata authority | Keep the repository's pinned notice/SBOM treatment | Loaded through the existing dynamic SQLite runtime; no new dependency |
| OPFS and Web Locks | Durable binary storage and cross-tab fence | Web Platform APIs | Required for durable product mode; no network permission |
| Existing Studio OPFS asset store | SHA-256 CAS, deduplication, owner references, verification | Project code plus existing compression dependencies/notices | Reused; PNG/PSD bytes are outside SQL |
| Former IndexedDB implementation | Explicit legacy import/test seam | Web Platform API | Never selected from ambient `globalThis.indexedDB` on product boot |

No package or lockfile change is required. The implementation adds no network request, cloud SDK,
credential, telemetry, upload, or server-side storage path.

## Deployment requirements

- Serve the existing cross-origin isolation and WASM headers required by the shared SQLite runtime.
- Browser must provide OPFS synchronous access handles for `opfs-sahpool` and Web Locks for durable
  cross-tab mutation fencing.
- Keep the shared SQLite handle app-lifetime scoped; lazy BG3D chunks must not independently install
  another SAH-pool VFS.
- CSP must permit the already-approved sqlite-wasm worker/WASM loading path; this change introduces
  no additional origin.
- Binary CAS data must be included in Studio data-destruction and quota operations through the
  existing asset-store root and owner references.

## Failure and rollback

- SQLite/OPFS open or write ambiguity fails closed; it does not fall through to old IndexedDB.
- Missing Web Locks produces an explicitly labelled current-tab memory mode rather than unsafe
  cross-tab durability.
- Corrupt catalog or CAS bytes block resume and preserve the evidence for diagnostics.
- Rollback may explicitly inject the legacy IndexedDB seam for controlled import/testing, but must
  not re-enable automatic product reads or dual writes.

## Unmeasured deployment gates

Safari/Firefox support, Windows/Linux OPFS behavior, mobile low-memory limits, actual browser Worker
peak memory, 3D output quality, CSP comparison, and production quota/device-loss matrices are not
claimed by the current focused Node/sqlite-wasm tests.
