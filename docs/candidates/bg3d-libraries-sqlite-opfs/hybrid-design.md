# BG3D library SQLite/OPFS hybrid design

## Product flow

```text
StudioBackground3D / project archive / canonical GLB download / DCC handoff
  -> V12 model and template operations
  -> acquireStudioLocalDatabase()
  -> /studio-local-v12.db
  -> kv[studio-bg3d-libraries-v12, models|templates|asset-metadata-manifest-v1]
  -> dedicated OPFS root toonspectrum-studio-bg3d-libraries-v12
       blobs/<sha256>.<codec>
```

The model import pipeline still converts supported GLTF/OBJ/FBX/DAE/STL/PLY/3DS inputs and linked
images into a validated self-contained GLB before this storage boundary. Therefore the durable
binary is the validator-owned GLB, while original external references and engine runtime objects
remain excluded.

## Manifest publication protocol

All mutations run through one in-realm queue and one named Web Lock. For one manifest slot:

1. read and strictly parse the current canonical SQLite manifest;
2. validate count, byte, ID, rights, metrics, revision, and duplicate ledgers;
3. write new model/thumbnail bytes to the CAS;
4. read the CAS object back, verify SHA-256, byte count, MIME, and index receipt;
5. install the union of old and new owner references;
6. publish the canonical SQLite manifest as the final authoritative content commit;
7. shrink owner references to exactly the new manifest set;
8. run mark-and-sweep only when the CAS index is within the configured 2,048-entry scan bound.

The old∪new owner fence protects deletions while SQLite is still reversible and protects additions
before publication. If SQLite publication fails, the old owner set is restored best-effort, leaving
at worst a grace-protected, collectable orphan. If post-commit owner shrink fails, the manifest and
union references preserve every live byte and the caller receives an explicit failure.

## Domain bounds

- Models: 512 entries, 100 MiB per existing validator limit, 4 GiB total manifest ledger, 8 MiB
  structured manifest, 2,048 deletion receipts.
- Thumbnails: one verified image CAS reference per model; dimensions and bytes retain the existing
  512px/thumbnail verifier bounds.
- Templates: 128 entries, 320 KiB canonical scene document each, 48 MiB aggregate scene JSON, 50
  MiB manifest ceiling.
- Asset metadata: 4,096 canonical V2 records and 16 MiB manifest ceiling.
- Cleanup: no foreground sweep when the CAS index exceeds 2,048 entries; diagnostics/manual recovery
  must handle that abnormal state.

Unknown versions, extra fields, noncanonical ordering/JSON, duplicate IDs or hashes, ledger drift,
missing CAS objects, wrong MIME/size, SHA-256 mismatch, and torn SQLite values fail closed. No valid
subset is returned from a corrupt manifest.

## Product wiring and legacy boundary

`StudioBackground3D.tsx`, `studio-bg3d-project-library.ts`,
`studio-bg3d-canonical-glb-download.ts`, `studio-bg3d-model-thumbnail-capture.ts`, and
`studio-hybrid-dcc-bg3d-handoff.ts` import V12 storage functions directly. The metadata API defaults
to V12 and enters IndexedDB only with an explicitly supplied `indexedDb` property.

No automatic import, background copy, or dual write reads the three pre-V12 databases. Controlled
legacy tools and the existing regression tests can still call the old functions explicitly. A
missing OPFS, shared SQLite handle, or Web Locks fence produces a visible storage failure; it does
not report an in-memory copy as saved.
