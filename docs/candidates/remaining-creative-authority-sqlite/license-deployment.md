# Remaining creative authority SQLite license and deployment

## Components

| Component | Version / source | License and notice | Deployment role |
|---|---|---|---|
| SQLite core | 3.53.0 through the existing lockfile | Public domain | SQL engine and database file format |
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1 | Installed package declares Apache-2.0; preserve package LICENSE/NOTICE and exact version in SBOM | Browser WASM wrapper and OPFS SAH-pool VFS |
| OPFS / SyncAccessHandle | Browser platform API | Web standard, no bundled third-party code | Durable local file backing for `studio-local-v12.db` |
| Scene/Emeres repositories and codecs | ToonSpectrum source | Project license | Stable model validation, authority protocol and UI state |

No new package, native binary, font, image corpus or external engine is added by this change.

## Deployment boundary

```text
/studio lazy creator UI
  -> acquireStudioLocalDatabase()
  -> existing dynamic @sqlite.org/sqlite-wasm runtime
  -> OPFS SAH-pool/toonspectrum-studio-sqlite
  -> studio-local-v12.db
       ├─ studio-scene-snapshots-v12
       └─ studio-emeres-library-v12
```

The app-lifetime database handle must be shared. Feature chunks must not independently install the
SAH-pool VFS or open a second filename. Memory VFS is test/fault-injection only and must never become
a product fallback.

## Data destruction and privacy

- Existing internal scene-snapshot IndexedDB and Emeres localStorage data are not migrated or read.
- V12 cutover deletion already targets the old Studio IndexedDB name and broad Studio localStorage
  prefixes. The new namespaces live inside `studio-local-v12.db`, which is covered by the existing
  triple-gated destructive reset.
- Scene snapshots and Emeres images can contain unpublished creative content. They remain same-origin
  local data and are not uploaded by these repositories.
- OPFS is not backup or cross-device sync. UI copy must continue to say “이 기기” and must not imply
  cloud recovery.

## Release checklist

- [x] No package or lockfile change.
- [x] Stable models are stored, not renderer/engine objects.
- [x] Product code has zero automatic legacy read for the two converted surfaces.
- [x] Corrupt data fails closed and no partial library is presented as complete.
- [x] SQLite failure is visible; memory state is explicitly labelled where retained.
- [ ] Add real Chromium OPFS raw benchmark and forced-termination evidence.
- [ ] Add bounded scene orphan vacuum before claiming quota reclamation complete.
- [ ] Verify multi-tab conflict behavior before advertising concurrent editing.
- [ ] Keep SQLite wrapper license/version checks in the repository-wide NOTICE/SBOM gate.
