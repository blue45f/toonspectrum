# Remaining creative authority SQLite benchmark plan

## Current automated evidence

The implementation currently has functional evidence, not browser performance evidence.

| Gate | Test | Current expectation |
|---|---|---|
| Real SQLite engine round-trip | `studio-scene-snapshot-sqlite-repository.test.ts` | Save with `openStudioLocalDatabase({vfs: "memory"})`, reopen a repository on the same sqlite-wasm database, exact canonical model equality |
| Scene immutable-record/index protocol | same test | Duplicate/delete, missing-record detection, corrupt-index rejection, later invocation wins |
| Emeres real SQLite round-trip | `studio-emeres-sqlite-repository.test.ts` | Canonical image-template bytes through sqlite-wasm, rename/category/delete, later invocation wins |
| Fail closed | both repository tests | Corrupt/non-canonical/missing data returns no partial library; OPFS open failure has no browser-storage fallback |
| Product generation fencing | `StudioSceneSnapshotPanel.test.tsx`, `StudioEmeresLibraryPanel.test.tsx` | Late hydration from a replaced repository is ignored |
| Explicit memory state | `StudioEmeresLibraryPanel.test.tsx` | Failed accepted mutation is visible only as tab-memory state |
| Product source boundary | `studio-remaining-creative-sqlite-authority-contract.test.ts` | Product panels/repositories do not reference legacy localStorage/IndexedDB authority |

## Required Chromium OPFS benchmark

Build a Vite production harness that imports the exact product repositories in a module Dedicated
Worker and opens `studio-local-v12.db` through the OPFS SAH-pool. Do not replace the repository with a
Map or in-memory SQLite port.

### Scene snapshot workloads

1. 64 small snapshots, then 8 replacements of the same ID.
2. Mixed corpus near 96MB total with representative data URLs and 3D payloads.
3. Cold open, warm list, save, replacement, duplicate and delete.
4. Forced Worker termination before record write, after record write, and after index switch.
5. Reopen and assert canonical digest/index identity; count and reclaim unreachable records.

### Emeres workloads

1. 30 downscaled PNG/WebP templates at small, median and near-bound sizes.
2. 200 sequential rename/category mutations and 30 replacements.
3. Close/reopen exact JSON digest.
4. Corrupt an unrelated key and the authority key independently; authority corruption must return no
   partial items.
5. Force quota exhaustion before `kvSet`; UI must enter explicit memory mode without a success label.

## Metrics

- p50/p95/p99 for cold open, warm load and each mutation;
- physical OPFS bytes and orphan bytes before/after vacuum;
- Worker/WASM peak memory only when the browser exposes a real measurement API; otherwise record
  `null`, not an estimate;
- bundle assets and incremental product chunk size separately;
- errors, console warnings, page/Worker CSP violations and failed requests;
- canonical SHA-256 before close and after reopen.

## Release gates

- zero partial-library return on malformed data;
- zero legacy browser-storage reads in the product probe;
- zero stale-generation UI overwrite;
- 100% digest equality after close/reopen and each forced-termination boundary;
- no claim of browser p95 or peak memory until raw artifact exists;
- CSP/CSP-app creative workflow parity remains a separate human lab gate.
