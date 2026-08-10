# Mannequin and BG3D LT preset SQLite license and deployment

## Components

| Component | Role | License/deployment note |
| --- | --- | --- |
| SQLite | Canonical local KV authority | Public domain upstream |
| `@sqlite.org/sqlite-wasm` | Browser WASM and OPFS SAH-pool bridge | Existing repository pin/notices; no dependency change |
| Web OPFS | Origin-private durable file backing | Web Platform API |
| ToonSpectrum repositories and schemas | Validation, ordering, fencing and UI failure semantics | Repository-owned code |

No package, lockfile, native binary, network service or copyleft dependency was added. Persisted
rows contain engine-neutral JSON only; Three.js objects, GPU resources and executable data are not
accepted.

## Deployment behavior

- Both product paths acquire the existing app-lifetime handle through
  `acquireStudioLocalDatabase()` and therefore use `studio-local-v12.db` in the established
  `toonspectrum-studio-sqlite` OPFS root.
- Lazy panels do not install a second VFS and do not close the shared handle.
- A database failure never silently switches authority to localStorage or IndexedDB.
- Corrupt rows are read-only failures; the product does not overwrite them with empty data.
- Old localStorage values are not automatically migrated. The mannequin's user-selected JSON
  import/export remains available; BG3D legacy storage functions require an explicitly supplied
  storage adapter and are not imported by product boot.

## Privacy and security

Mannequin poses and LT presets reveal creative workflow but contain no credentials. Exact field
sets, byte budgets, finite numeric values, stable IDs and canonical serializers bound memory and
reject prototype/future/unknown data. OPFS remains same-origin local storage and is not a backup or
cloud synchronization claim.

## Operational gaps

- Chromium 140 production-build execution, OPFS SAH-pool close/reopen and committed-write Dedicated
  Worker termination recovery are verified by
  `tests/benchmarks/results/mannequin-bg3d-preset-sqlite-opfs-browser.json`.
- The measured bundle served sqlite wasm and its OPFS proxy under COOP `same-origin`, COEP
  `require-corp`, CORP `same-origin` and a CSP containing `wasm-unsafe-eval`; there were no browser
  console/page/network/CSP errors.
- Memory VFS and localStorage fallback were never used. Both Dedicated Worker memory APIs were
  unexposed and are recorded as `null`, so peak memory remains an external gate.
- Safari/Firefox, Windows/Linux, quota exhaustion, mid-transaction process kill and full tab crash
  remain unmeasured browser/OS gates.
- Multi-tab semantic conflict handling is not promoted by this small-row repository.
- Production data destruction is controlled by the central V12 cutover flags; this slice neither
  executes a destructive reset nor edits the central discard inventory.
