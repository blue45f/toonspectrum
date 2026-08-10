# Palette, Brand Kit, and saved clip SQLite license and deployment

## Components

| Component | Version/source | License | Deployment role |
|---|---|---|---|
| `@sqlite.org/sqlite-wasm` | Existing lockfile pin, 3.53.0-build1 | Apache-2.0 package | Lazy browser SQLite module, wasm, Worker/proxy, and OPFS VFS |
| SQLite core | Bundled by sqlite-wasm | Public domain | SQL/KV durability engine |
| OPFS SAH-pool | Browser platform + sqlite-wasm adapter | Web platform / package notices | Shared V12 local database authority |
| React/Vite application | Existing workspace versions | Existing project notices | Product panels, lazy repository loading, and deployment bundling |
| Vitest/jsdom | Existing development dependencies | Existing tooling notices | Correctness, source-contract, and UI race tests only |

No dependency, package manifest, or lockfile change is required. This lane reuses the
already deployed sqlite-wasm assets and shared `/studio-local-v12.db`; it does not ship a
second SQLite binary, database file, IndexedDB adapter, or localStorage mirror.

## Runtime requirements

- Secure context or loopback origin.
- Dedicated Worker support for the production OPFS path.
- `navigator.storage.getDirectory` and sync access handles in the Worker.
- Existing CSP permission for same-origin Worker/script and wasm evaluation.
- One shared database-runtime owner; feature chunks must not install independent SAH
  pools or close the app-lifetime handle behind another repository.

If any requirement is unavailable, repositories return an explicit unavailable error.
The UI may retain an accepted edit only in labelled current-tab memory. There is no
automatic IDB/localStorage fallback and no claim of account/cloud durability.

## Payload and rights boundary

Named palettes, font-family strings, palette references, Brand Kit names, and saved clip
elements are user-authored metadata. Brand logos can contain user-provided copyrighted
art or marks; persisting a logo locally does not grant redistribution rights. Export,
marketplace upload, team sync, and rights BOM processing remain separate explicit flows.

Data URLs are restricted to PNG, JPEG, or WebP and bounded before durable write. This is
a storage-format gate, not malware scanning. Deployments that later accept SVG logos or
external URLs need separate sanitization, fetch, CSP, and license review.

## Operational constraints

- Namespace ownership is fixed to `studio-named-palettes-v12`, `studio-brand-kits-v12`,
  and `studio-saved-clips-v12`; changing a namespace is a data-format decision.
- The logical filename remains `studio-local-v12.db`; this lane must not reopen a legacy
  database filename.
- Old localStorage helpers remain explicit test/import seams and must not appear in
  product boot or normal mutation call sites.
- Backup/export, device transfer, server sync, and account sharing are not implied by
  local SQLite.
- Actual quota exhaustion, browser-process crash, OPFS eviction, and multi-tab semantic
  conflicts remain release risks until the benchmark plan records direct evidence.
