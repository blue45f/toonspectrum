# VRM asset SQLite/OPFS hybrid design

## Authority split

The durable design is hybrid by payload strength:

```text
/studio product UI
  -> vrm-library.ts / studio-vrm-texture-paint-library.ts
  -> studio-vrm-asset-sqlite-opfs-repository.ts
       ├─ acquireStudioLocalDatabase()
       │    -> toonspectrum-studio-sqlite/studio-local-v12.db
       │         ├─ studio-vrm-model-assets-v12 / manifest-v1
       │         └─ studio-vrm-texture-paint-assets-v12 / manifest-v1
       └─ OPFS root: toonspectrum-studio-vrm-assets-v12
            ├─ blobs/<sha256>.<codec>
            ├─ commits/<sha256>.json
            └─ asset-store index/owner references
```

- SQLite owns logical visibility, catalog ordering, metadata schema and manifest generation.
- OPFS owns immutable VRM/GLB, thumbnail and texture PNG bytes.
- SHA-256 is the only binary identity crossing the boundary.
- React owns a clearly labelled current-tab working copy only when durable storage is unavailable.
- Stable project documents contain content hashes and validated metadata, never a runtime renderer
  object or an OPFS/SQLite implementation handle.

## Blob commit and manifest-last protocol

A new or replacement asset is committed in this order:

1. Validate all public input bounds and canonical metadata.
2. Copy bytes into the OPFS content-addressed store using identity encoding.
3. Compare the store's SHA-256 and byte count with the expected descriptor.
4. Read the blob through `verify: true` and reject any missing, truncated or hash-mismatched bytes.
5. Create or validate the exact canonical `commits/<sha256>.json` marker.
6. Re-read the current SQLite manifest and compare it with the operation's raw baseline.
7. Update bounded CAS owner references for both live model and texture manifests.
8. Write the next canonical SQLite manifest **last**.
9. Re-read SQLite and require byte equality with the exact serialized manifest.

Stopping before step 8 leaves an unreachable OPFS orphan. It never appears in a product list.
Stopping after step 8 exposes a manifest that references a previously written, verified blob and
commit marker. A read still verifies marker fields, blob length and SHA-256, so deletion or tampering
fails closed instead of returning partial content.

## Manifest contracts

### Model manifest

The model manifest has exact `kind`, version 1, a monotonically increasing safe generation,
canonical model entries and sample-thumbnail entries. Every model descriptor repeats and agrees on
content hash, bytes and `model/gltf-binary`. Thumbnail descriptors allow only PNG/JPEG/WebP. Entry
IDs are bounded safe opaque identifiers; names must already equal their bounded NFKC-normalized
single-line form. Sorting and property order are canonical, and `JSON.stringify(parsed) === raw` is
required on load.

### Texture manifest

The texture manifest stores only canonical paint artifact receipts and matching CAS descriptors.
The PNG body stays in OPFS. Artifact kind/version, content hash, MIME, dimensions, pixel count,
binding counts and byte count must pass the existing texture-artifact verifier before a save and
after every load.

## Concurrency and lifecycle fencing

- A shared `WeakMap<StudioLocalDatabase, Map<owner, Promise>>` serializes all repository instances
  that use the same SQLite handle and CAS owner. A later invocation cannot overtake an earlier one.
- Each mutation snapshots the raw manifest, checks that it is still current immediately before the
  authority switch, increments the canonical generation, and verifies the exact persisted bytes.
- Each repository instance has a lifecycle generation. `close()` increments that fence; delayed
  work may not publish or return success after close. Closing a feature repository does not close
  the app-lifetime shared SQLite handle.
- A newly created repository over the same database/filesystem reopens and verifies the same
  manifest, marker and content bytes.

The queue is same-JavaScript-realm protection. Real multi-tab arbitration remains a deployment gate;
the implementation does not claim that SQLite physical serialization provides product-level merge
semantics.

## Bounded orphan cleanup

Cleanup computes live hashes from both strict SQLite manifests, then considers unreferenced CAS
index entries, commit files and blob files. It is deliberately bounded to 1..256 removals per call
(default 32). Markerless or malformed-marker files require either the configured grace interval or
observation in a prior cleanup pass; this avoids deleting another operation's in-flight blob.
Deletion removes the asset-store record and related marker/blob paths, while the SQLite manifests
remain the sole visibility authority.

## Failure behavior

- Missing OPFS, unavailable SQLite, write/read/verification failure, invalid input, generation
  conflict, corruption and limit overflow are explicit typed failures.
- Product code does not switch to IndexedDB, localStorage or an in-memory repository and then report
  durable success.
- A valid user-selected model may remain in a current-tab map with explicit reload-loss copy. It is
  labelled `현재 탭 임시`, and portable project insertion is blocked until durable publication
  succeeds.
- Corrupt/future/noncanonical manifests are read-only failures. They are not overwritten with an
  empty library.

## Legacy boundary

The old IndexedDB implementation remains only behind explicitly supplied `legacyIndexedDb` or
`indexedDb` options so existing isolated tests and embed integrations can exercise it. Product
defaults never resolve `globalThis.indexedDB`, never enumerate old rows and never perform implicit
migration. The only supported ingress is a file the user explicitly selected, followed by the same
strict VRM/PNG validation and new-authority commit.
