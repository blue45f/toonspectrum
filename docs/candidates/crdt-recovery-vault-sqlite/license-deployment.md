# CRDT recovery vault SQLite license and deployment

## Components

| Component | Version / source | License and notice | Deployment role |
|---|---|---|---|
| SQLite core | 3.53.0 through the existing repository lock | Public domain | Transactions, constraints, deterministic scans, local database format |
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, existing dependency | Package declares Apache-2.0; retain package LICENSE/NOTICE and exact SBOM pin | Browser WASM API and OPFS SAH-pool VFS |
| OPFS / SyncAccessHandle | Browser platform | Web standard | Durable same-origin backing for `studio-local-v12.db` |
| V12 recovery schema/adapter | ToonSpectrum source | Project license | Bounded row persistence, corruption checks, marker/chunk/manifest semantics |
| Same-page marker latch | ToonSpectrum source | Project license | Ephemeral current-page fail-closed guard only |
| Former IndexedDB/localStorage data | Browser platform plus historical ToonSpectrum formats | Web standard / project license | Destruction inventory or future explicit salvage only; absent from product boot |

No dependency, package manifest, lockfile, native binary, or notice change is required for this
slice. The implementation reuses the repository's already-pinned SQLite WASM distribution.

## Deployment boundary

```text
/studio collaboration binding
  -> createStudioCrdtRecoveryVault()
  -> PersistentStudioCrdtRecoveryVault
  -> createStudioCrdtRecoverySqlitePersistence()
  -> acquireStudioLocalDatabase()          one app-lifetime handle
  -> requireStudioCrdtRecoveryDatabase()   v6 fail-closed capability
  -> dynamic @sqlite.org/sqlite-wasm
  -> OPFS SAH-pool/toonspectrum-studio-sqlite
  -> studio-local-v12.db
       └─ crdt_recovery_v12_rows
```

Feature code must not install a second SAH-pool, open a recovery-specific SQLite file, use memory
VFS in production, reconstruct the removed JSON KV index, or open browser KV as a fallback.

## Data and privacy

- Recovery chunks may contain unpublished creative operations. They remain same-origin and are
  not uploaded by this adapter.
- SQL identity includes authenticated scope and work ID. Product scoped reads do not enumerate a
  different account's rows.
- Failure code/message are bounded diagnostics. They must not be expanded to credentials, tokens,
  full HTTP payloads, or unrelated user content.
- Export bundles intentionally omit the authenticated scope while retaining work-local update data.
- OPFS durability is not backup, cloud sync, or cross-device recovery; product copy must not imply
  those guarantees.

## Legacy and cutover policy

`LEGACY_DATA_MIGRATION=FALSE` for this authority:

- product boot does not open `toonspectrum-studio-crdt-recovery-vault` IndexedDB;
- product boot does not scan the former permanent-rejection localStorage prefix;
- no legacy row is copied into v6 automatically;
- the existing data-destruction inventory may still name historical storage so an explicit,
  separately gated cutover can delete it;
- a future salvage tool must be user-directed, bounded, validate every row, and remain separate
  from normal product construction.

## Release checklist

- [x] Sequential v6 migration and rollback fault test.
- [x] Structured scoped row table with row-kind constraint and deterministic index.
- [x] Transactional row/byte capacity check and upsert.
- [x] Marker-before-chunk and manifest-last recovery semantics.
- [x] Canonical JSON, identity, protocol, and UTF-8 byte-count corruption checks.
- [x] Explicit degraded durability error; no browser-KV durable success.
- [x] Product boundary test for shared SQLite construction and collaboration recovery lock.
- [x] No package, lockfile, notice, StudioPage, or unrelated feature change.
- [ ] Real Chromium OPFS p50/p95/p99, physical bytes, and Worker/page peak memory.
- [ ] Multi-tab, quota, pagehide, forced-termination, browser, and OS matrix.
- [ ] Explicit exported-frontier retention/deletion policy.
- [ ] Yjs convergence, server dedupe, network-partition, and cross-device recovery gates.
