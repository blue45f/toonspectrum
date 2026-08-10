# VRM creative local authority capability survey

Date: 2026-08-09
Subsystem: VRM custom poses, full poser states, and engine-neutral pose-material presets

## Decision context

Custom poses, full poser states, pose-material presets, and device-specific tracking calibration
are durable inputs to reproducible VRM output. Calibration is not document content, but its
head/gaze/blink/mouth baselines materially affect capture precision and therefore must not depend on
a synchronous browser KV store. Product defaults use the existing app-lifetime
`studio-local-v12.db` handle. Existing helper functions remain only for explicit JSON import and
injected tests;
`LEGACY_DATA_MIGRATION=FALSE` forbids automatic reads of their old keys.

## Candidate comparison

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shared `@sqlite.org/sqlite-wasm` + OPFS SAH pool | One transactional local authority already shared by Studio history and catalogs; namespace isolation; canonical rows | Browser OPFS payload and long-soak measurements for this exact VRM slice are pending | Lossless canonical JSON; no engine objects | Functional real-wasm memory-VFS tests complete; browser OPFS latency unmeasured | Unmeasured for this slice | Existing pinned runtime; no new dependency or bundle | Canonical serialization and invocation-ordered queues | SQLite public domain; wrapper Apache-2.0 | Low: existing `acquireStudioLocalDatabase()` | Low/medium: OPFS browser support and quota | **Product default** |
| `localStorage` | Simple synchronous API | Main-thread stalls, small quota, no transaction, weak corruption handling, no shared authority | Lossless only while writes succeed | Not promoted; synchronous latency was not measured for this change | Unmeasured | 0 B | String roundtrip is deterministic | Web Platform API | Low initially, high recovery cost | High for creative authority | Explicit legacy import/test seam only; never auto-read |
| Dedicated IndexedDB database | Async blobs and broad browser support | Another database lifecycle, schema, recovery and concurrency authority beside V12 SQLite | Lossless | Unmeasured | Unmeasured | 0 B platform API | Depends on custom transaction protocol | Web Platform API | Medium/high | Medium/high due duplicate authority | Rejected for this slice |
| Raw OPFS JSON files | Origin-private durable files | Must rebuild indexing, atomic replace, locking, schema migration and corruption handling | Lossless | Unmeasured | Unmeasured | 0 B platform API | Possible with extra canonical protocol | Web Platform API | Medium | High bespoke maintenance | Rejected for metadata; retain OPFS for large binary assets |

## Implemented product paths

- `src/domains/creator/StudioVrmPoser.tsx`
  - custom pose create/load/delete and strict all-or-nothing JSON import
  - full poser state create/update/load/delete
  - serialized UI mutation queue, hydration/mutation/unmount generation fencing
  - explicit memory-only warning after durable write failure
- `src/domains/creator/StudioVrmPoseMaterialPanel.tsx`
  - async SQLite hydration and save of complete canonical material payloads
  - create/update/delete/import/export over the in-memory canonical snapshot
  - explicit legacy `storage` prop only for import/test integration
- `src/domains/creator/studio-vrm-creative-sqlite-repository.ts`
  - namespaces `studio-vrm-custom-poses-v12` and `studio-vrm-full-poser-states-v12`
- `src/domains/creator/studio-vrm-pose-material-sqlite-repository.ts`
  - namespace `studio-vrm-pose-materials-v12`
- `src/domains/creator/studio-vrm-tracking-calibration-sqlite-repository.ts`
  - strict canonical finite-value row in namespace `studio-vrm-tracking-calibration-v12`
  - invocation-ordered save/clear, fail-closed malformed read, no browser-KV downgrade
- `src/domains/creator/StudioVrmPoser.tsx`
  - generation-fenced async calibration hydration and explicit SQLite/saving/current-tab/error status

## Quality and data-integrity verdict

Selection is quality-first: exact normalized bone values, translations, expression weights,
full-state stable data, and pose-material quaternions survive byte-canonical roundtrips. Any unknown
field, duplicate identity, non-finite value, unsafe bone, count overflow, byte overflow, future or
noncanonical envelope fails closed. No partial list is returned and no invalid member is silently
discarded.

## Quarantine

- Actual Chromium OPFS close/reopen p50/p95/p99 for maximum custom-pose, full-state, material and
  calibration
  payloads is unmeasured.
- Safari/Firefox and Windows/Linux device matrices are unmeasured.
- OPFS quota exhaustion, process kill during a maximum write, multi-tab conflict UX, and 8h/24h
  soak are not complete for this slice.
- Existing pre-V12 keys are intentionally not migrated or automatically read.
