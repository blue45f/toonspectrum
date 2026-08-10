# CRDT outbox SQLite license and deployment

## Components

| Component | Version / source | License and notice | Deployment role |
|---|---|---|---|
| SQLite core | 3.53.0 through the existing repository lock | Public domain | Transactions, constraints, ordering and local database format |
| `@sqlite.org/sqlite-wasm` | 3.53.0-build1, existing dependency | Package declares Apache-2.0; retain package LICENSE/NOTICE and exact SBOM pin | Browser WASM API and OPFS SAH-pool VFS |
| OPFS / SyncAccessHandle | Browser platform | Web standard | Durable same-origin file backing for `studio-local-v12.db` |
| V12 outbox schema/adapter | ToonSpectrum source | Project license | Canonical request validation, bounds, ACK and retry semantics |
| Legacy IndexedDB seam | Browser platform plus ToonSpectrum adapter | Web standard / project license | Explicit import or test only; absent from product boot |

No dependency, native binary, package manifest or lockfile changes are required.

## Deployment boundary

```text
/studio collaboration binding
  -> createStudioCrdtOutbox()
  -> SerializedStudioCrdtOutbox
  -> SqliteStudioCrdtOutbox
  -> acquireStudioLocalDatabase()       (one app-lifetime handle)
  -> dynamic @sqlite.org/sqlite-wasm
  -> OPFS SAH-pool/toonspectrum-studio-sqlite
  -> studio-local-v12.db
       ├─ crdt_outbox_v12_entries
       └─ crdt_outbox_v12_acknowledgements
```

Feature code must not install a second SAH-pool, open another product filename, use memory VFS as a
silent browser fallback, or read the former IndexedDB on startup.

## Data, privacy and cutover

- Pending CRDT updates may contain unpublished creative work. They remain same-origin and are not
  uploaded by the storage adapter; only the existing collaboration transport publishes them.
- Scope includes the authenticated user and work ID so a later account cannot list another user's
  unsent updates through the product API.
- `LEGACY_DATA_MIGRATION=FALSE`: the old `toonspectrum-studio-crdt-outbox` database is neither read
  nor imported automatically. The existing cutover destruction inventory remains the owner of its
  eventual deletion.
- OPFS is local durability, not backup or cross-device recovery. Product copy must not imply cloud
  protection.
- Retry error messages are bounded diagnostics and must not be expanded into credentials or full
  server payload logs.

## Release checklist

- [x] Shared V12 database and sequential v5 migration.
- [x] Transactional bounded enqueue, ACK/removal and monotonic retry metadata.
- [x] Deterministic order and conflicting update-ID rejection.
- [x] Corrupt canonical rows fail closed; no partial queue is returned.
- [x] Product boot has no automatic legacy IndexedDB read.
- [x] Real sqlite-wasm named-VFS close/reopen and fault rollback tests.
- [x] No package, lockfile, central ADR or data-discard policy change.
- [ ] Real Chromium OPFS p50/p95/p99, physical bytes and Worker/WASM peak memory.
- [ ] Multi-tab/browser/OS contention and forced-termination matrix.
- [ ] ACK tombstone retention/GC policy proven against late writers and server receipts.
- [ ] Yjs convergence, server dedupe, network-partition and CSP human workflow gates.
