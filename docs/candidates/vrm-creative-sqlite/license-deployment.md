# VRM creative SQLite license and deployment

## Components

| Component | Role | License/deployment note |
| --- | --- | --- |
| SQLite | Local relational/KV authority | Public domain upstream |
| `@sqlite.org/sqlite-wasm` | Browser WASM and OPFS SAH-pool bridge | Existing repository pin and notices apply; no dependency change in this slice |
| Web OPFS | Durable origin-private file backing | Web Platform API |
| ToonSpectrum canonical schemas/repositories | Validation, queueing and product UX | Repository-owned code |

No package, lockfile, native binary, network provider or copyleft engine was introduced. The four
namespaces contain only stable engine-neutral JSON; Three.js/VRM runtime objects are rejected at the
persistence boundary. Tracking calibration contains numeric device/user baselines only and adds no
engine or package dependency.

## Deployment behavior

- Product code acquires the existing app-lifetime handle through `acquireStudioLocalDatabase()`.
- The database remains `studio-local-v12.db` under the existing `toonspectrum-studio-sqlite` OPFS
  root.
- Lazy panels do not independently install an OPFS VFS or close the shared handle.
- Database-open or write failure does not silently switch product authority to a legacy browser KV
  key. Failed writes remain current-tab memory with an explicit ephemeral warning.
- Corrupt/noncanonical reads are fail-closed and read-only; they are not replaced with an empty row.
- Existing Studio internal data is not migrated. Explicit user-selected JSON import is bounded and
  all-or-nothing.

## Privacy and security

Pose data and tracking baselines can identify a creator's workflow but contain no credentials,
remote URLs or executable payload. Canonical validators reject prototype keys, arbitrary scene-node
names, non-finite values, unknown schema fields and engine runtime objects. Clipboard, webcam consent
and recent items retain their purpose-specific stores; calibration uses a separate SQLite namespace
and is not mixed into creative library rows.

## Operational gaps

- OPFS is local durability, not backup. The separate V12 authenticated recovery-package feature is
  the export boundary; this slice does not add cloud upload.
- Browser/OS support, quota policy, large-payload peak memory and multi-tab conflict UX require the
  benchmark plan before broad release promotion.
- Existing browser keys may be discarded at V12 cutover under the documented destructive flag;
  this feature does not read or rewrite them.
