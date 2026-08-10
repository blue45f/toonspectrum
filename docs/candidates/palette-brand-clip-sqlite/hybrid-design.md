# Palette, Brand Kit, and saved clip SQLite hybrid design

## Authority and data flow

```text
StudioPaletteLibraryPanel
  -> getProductStudioPaletteSqliteRepository()
StudioBrandKitPanel
  -> getProductStudioBrandKitSqliteRepository()
  -> getProductStudioPaletteSqliteRepository()  (palette references only)
StudioPage palette/clip actions
  -> lazy product palette or saved-clip repository

all repositories
  -> acquireStudioLocalDatabase()
  -> shared OPFS SAH-pool
  -> /studio-local-v12.db
  -> kv(separate V12 namespace, key="library-v1")
```

SQLite objects, statements, Worker handles, and OPFS handles never enter creative model
objects. Stable palette, Brand Kit, and clip values remain ordinary ToonSpectrum types.
Brand logos and clip element payloads are bounded canonical JSON in the shared KV table
for this slice; moving large binary assets to a blob table is a future optimization, not
a hidden behavior in the current implementation.

## Strict canonical boundary

Every durable read and write applies all-or-nothing validation:

1. Reject an envelope over the feature byte limit before accepting it.
2. Parse JSON and require exactly `schema`, `version`, and `items`.
3. Require exact item keys, unique bounded IDs, bounded names, safe integer timestamps,
   and feature-specific values.
4. Reject unknown fields, duplicate IDs, uppercase/noncanonical colors, invalid data
   URLs, `undefined`, `NaN`, `-0`, non-plain objects, excessive depth/node count, or an
   excessive element/item count.
5. Re-serialize to compact canonical JSON and require byte equality on reads.
6. Only after the complete next library passes validation does one queued `kvSet` replace
   the previous value.

There is no partial row recovery because partial recovery could silently detach a Brand
Kit palette, remove a clip element, or change a palette's authored order.

## Hard limits

| Surface | Item limit | Per-item/content limit | Whole-library UTF-8 limit | Overflow behavior |
|---|---:|---:|---:|---|
| Named palettes | 40 palettes | 1,000 colors; ID/name 160 chars | 2 MiB | Reject; prior canonical library remains byte-identical |
| Brand Kits | 40 kits | ID/name 160 chars; fonts 512 chars; logo data URL 4 MiB; dimensions ≤8,192px | 64 MiB | Reject; no oldest-item eviction or logo truncation |
| Saved clips | 40 clips | 4,096 elements; ID/name 160 chars; JSON depth 64; 250,000 JSON nodes; one clip 16 MiB | 64 MiB | Reject; no element/list truncation |

The Brand Kit upload UI also rejects source files over 8 MiB before decode and
downscales accepted logos to at most 320px before constructing the canonical value.

## Ordering and race control

- Each repository owns a promise-tail mutation queue. A later invocation reads the
  result of the earlier committed mutation and therefore remains authoritative.
- Panels keep model refs so memory fallback applies to the latest accepted list rather
  than a stale render closure.
- Hydration, mutation, and mount lifetimes use independent generation fences. A mutation
  invalidates reads that started before it and reads started by a synchronous repository
  notification while the write was pending.
- `StudioPage` adds a UI-level clip mutation queue around the repository queue because
  create/delete calls originate in separate event paths.
- Unmount fences prevent late promises from publishing state or success messages.

## Failure UX and legacy policy

An unavailable durable write may keep the already-validated mutation in current-tab
memory. The UI explicitly says `현재 탭 메모리 임시 · 새로고침 시 사라짐`; it never says
saved. Canonical validation and hard-limit failures are rejected instead of degrading to
memory because presenting invalid or truncated creative data would hide a correctness
failure.

The old synchronous helpers and keys remain only for explicit tests/import tools.
Product panels and `StudioPage` do not call them during boot, hydration, or mutation.
There is no automatic probing, copying, merging, or deletion of old keys.
