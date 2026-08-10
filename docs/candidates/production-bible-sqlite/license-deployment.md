# Production Bible SQLite license and deployment

## Components

| Component | Version/source | License | Deployment role |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, existing lockfile pin | Apache-2.0 package | Browser SQLite ES module, wasm and OPFS async proxy |
| SQLite core | Bundled by sqlite-wasm | Public domain | SQL engine and VFS runtime |
| OPFS SAH-pool | Browser platform + sqlite-wasm | Web platform / package notices | Dedicated Worker storage authority |
| Playwright Chromium | Existing development dependency | Apache-2.0 tooling; Chromium notices apply | Evidence runner only, not shipped Studio runtime |
| Vite | Existing workspace version | MIT | Production evidence bundle only; application already uses Vite |

No new package or lockfile change was made. The product reuses the existing lazy
sqlite-wasm assets and shared V12 DB runtime.

## Production bundle boundary

The measured evidence bundle contained:

- one `sqlite3-*.wasm` asset;
- `sqlite3-opfs-async-proxy-*.js`;
- `sqlite3-worker1-*.js`;
- the Production Bible module Worker;
- the page entry and source maps used by the test build.

Production Bible metadata does not add a second SQLite binary, IDB wrapper, or native
process. It stores canonical JSON in the existing shared `/studio-local-v12.db` file.

## Browser requirements

- Secure context or loopback origin.
- Module Dedicated Worker.
- `navigator.storage.getDirectory`.
- `FileSystemFileHandle.createSyncAccessHandle` in the Worker.
- CSP permitting same-origin Worker/script and wasm evaluation.
- COOP/COEP/CORP when memory measurement or cross-origin isolation is required.

If these capabilities are absent, the repository returns an explicit unavailable state.
It does not silently select legacy IndexedDB/localStorage. Session memory may retain an
already accepted edit after a failed save, but the UI labels it non-durable.

## Data and rights

The stored fields are user-authored metadata and stable references, not engine binaries.
Export/import remains explicit JSON. A deployment must include the existing sqlite-wasm
Apache-2.0 notice and SQLite public-domain attribution context in the product Rights/SBOM
pipeline. Production Bible itself introduces no third-party creative asset license.

## Operational constraints

- The shared database handle is app-lifetime; feature chunks must not install independent
  SAH pools concurrently.
- The logical filename is V12-only. `/studio-local.db` must never be reopened by this lane.
- Backup/export and server sync are separate product features; local SQLite must not be
  presented as cloud durability.
- Actual browser quota exhaustion, OS disk-full, browser-process crash and multi-tab
  semantic conflicts remain explicit release-risk entries until separately measured.
