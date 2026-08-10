# VRM creative SQLite hybrid design

## Authority split

The product uses one existing SQLite file with four independent canonical KV namespaces:

```text
studio-local-v12.db
├── studio-vrm-custom-poses-v12 / library-v1
├── studio-vrm-full-poser-states-v12 / library-v1
├── studio-vrm-pose-materials-v12 / library-v1
└── studio-vrm-tracking-calibration-v12 / device-default-v1
```

This is a hybrid by payload strength rather than a blanket migration:

- SQLite/OPFS owns durable user-authored pose libraries.
- React state owns the current tab's optimistic working copy and keeps a failed write visible.
- Clipboard APIs and their explicit session fallback remain clipboard/session behavior.
- Webcam consent and recent pose/character hints remain preference/session data. Tracking
  calibration is isolated from creative libraries but uses SQLite because it changes capture
  precision and must survive reload without synchronous main-thread storage.
- JSON file import/export is the only explicit interchange and legacy ingress.

## Canonical row contracts

### Custom poses

- Maximum 256 entries and 4 MiB aggregate UTF-8 JSON.
- Exact fields: `id`, `label`, `yOffset`, `bones`, `poseTranslations`, `expressionWeights`.
- IDs are bounded safe opaque identifiers; labels are NFKC-normalized single-line text up to 80
  characters.
- Bone names must be in the VRM humanoid allowlist. Rotations/directions, translation limits and
  expression weights reuse the strict full-state validator.
- Duplicate IDs or one malformed member reject the complete row.

Explicit file import may promote an old pose that omitted translations or expression weights, but
only because the user chose a file. It never probes an old browser key, remaps every imported ID,
and validates the combined post-import library before changing UI state.

### Full poser states

- Maximum 100 named states, 2 MiB per state, 16 MiB aggregate.
- Names are canonical NFKC text up to 24 characters and sorted in the persisted envelope.
- Every state passes `deserializeFullVrmState`, including bounded opaque costume, wardrobe, props,
  scene props, physics and Avatar Forge data. Runtime engine objects, unknown fields, NaN and
  invalid persistent IK blocks are rejected.

### Pose materials

- Reuses the engine-neutral pose-material wire schema and its 64-entry/256 KiB library limit.
- SQLite rows must equal the existing canonical serializer byte for byte.
- A product save always writes the complete validated snapshot, so recovery never exposes a
  half-merged material list.

### Tracking calibration

- One canonical finite-value row stores head pitch/yaw/roll, gaze, open-eye baselines and neutral
  mouth opening with schema version 1.
- Unknown fields, pretty/noncanonical JSON, future versions and non-finite values reject the row as
  a whole. A corrupt row is never replaced with defaults during hydration.
- Save and clear share one mutation queue; clearing immediately after a delayed save cannot resurrect
  the stale calibration. Product state uses a generation fence so stale hydration/completion cannot
  overwrite a newer measurement.

## UI concurrency and failure semantics

Both product panels follow the same lifecycle:

1. Start an async SQLite hydration and capture its generation.
2. Apply the result only while mounted and only if no newer mutation generation exists.
3. Build and validate a complete next snapshot in memory.
4. Update the visible list optimistically.
5. Serialize writes through one promise tail in invocation order.
6. Ignore stale completion callbacks after a newer generation or unmount.
7. On durable failure, preserve the complete in-memory snapshot and show
   `현재 탭 메모리 임시 · 새로고침 시 사라짐`.

For custom poses and full states, dirty-authority tracking prevents a successful write in one
namespace from falsely clearing a failed write in the other. A hydration corruption/error is
read-only and fail-closed so an unknown canonical row cannot be overwritten as empty.

## Legacy boundary

`studio-pose-material-library.ts` and the Poser JSON file importer remain explicit seams. Product
defaults do not resolve browser storage and do not read old custom-pose/full-state/material keys.
This deliberately follows `LEGACY_DATA_MIGRATION=FALSE`; users may opt into a bounded file import.
