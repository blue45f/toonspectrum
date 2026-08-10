# BG3D library SQLite/OPFS license and deployment

## Components

| Component | Role | License handling | Deployment note |
| --- | --- | --- | --- |
| `@sqlite.org/sqlite-wasm` | Shared V12 canonical manifest authority | Retain the repository's pinned version, notices, SBOM, and audit policy | Existing dynamic import only; no new dependency or eager bundle |
| OPFS | SHA-256 CAS for validated GLB and thumbnail bytes | Web Platform API | Dedicated root `toonspectrum-studio-bg3d-libraries-v12`; no network permission |
| Web Locks | Cross-tab read/modify/write fence | Web Platform API | Required for durable mutation; absence is an explicit product failure |
| Studio OPFS asset store | Hashing, byte/MIME receipts, owner refs, mark-and-sweep | Project code plus existing compression notices | Uses identity codec for model/image evidence; full hash verification on reads |
| Former IndexedDB stores | Controlled legacy import and regression seam | Web Platform API | Never selected from ambient IndexedDB on product boot |

No package, lockfile, server API, cloud SDK, credential, telemetry, upload, or network path is added.
Model and thumbnail data remain origin-local.

## Deployment requirements

- Preserve the existing sqlite-wasm WASM/Worker CSP and cross-origin isolation headers.
- Provide OPFS synchronous access handles required by the shared `opfs-sahpool` runtime.
- Keep one app-lifetime `acquireStudioLocalDatabase()` handle; BG3D lazy chunks must not install a
  second SAH-pool VFS.
- Provide Web Locks for cross-tab durable writes.
- Add the dedicated OPFS root and all three legacy IndexedDB names to the central V12 destructive
  cutover inventory in the coordinating change. This candidate task intentionally does not edit the
  centrally owned discard files.
- Treat quota or ambiguous SQLite/OPFS failures as unsaved. Do not enable localStorage/base64 or
  ambient IndexedDB fallback.

## Rollback and recovery

- A pre-publication failure preserves the old manifest and restores its owner set when possible.
- A post-publication owner cleanup failure retains the old∪new set, preferring a recoverable leak
  over data loss.
- Corrupt evidence remains available for diagnostics; no partial row filtering claims success.
- Rollback may invoke an explicitly constructed legacy importer, but must not restore automatic
  product reads or dual writes.

## Unmeasured deployment gates

Actual Chromium OPFS p50/p95/p99, Dedicated Worker peak memory, Safari/Firefox behavior,
Windows/Linux/mobile devices, quota pressure, tab/process kill timing, 8-hour/24-hour soak, physical
GPU visual parity, P3/HDR, CSP comparison, and target DCC round-trip remain release gates.
