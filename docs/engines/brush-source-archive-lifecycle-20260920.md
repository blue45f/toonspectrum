# Brush original archive integrity and download lifecycle

Status: implemented follow-up; no renderer or native-file execution changes.
Baseline: main `6c8b07a9199951c1e88c118a498e586c8a3f7dc5`.

## Reconciliation

Native original preservation was already merged by PR #1867 (OPFS CAS bytes, compact SQLite references). The older `fix/brush-original-source-complete-20260920` branch carried an embedded-record alternative. It was not merged over the newer implementation. Both old commits remain available; this branch starts from current main and preserves the CAS, deduplication, byte verification and original settings contracts.

## Implemented changes

- Ordinary JSON exports check the same 2MiB UTF-8 settings ceiling as import, rather than emitting a file that this application cannot reimport. An over-limit export throws without shortening the settings or dropping an original.
- Archive input checks both the existing character and UTF-8 byte bounds before JSON parsing. Archive output checks the final envelope against both limits. No file-size allowance, storage schema or format version is increased.
- Original-file download is single-flight per current action. Cancel, unmount and replacement of source metadata invalidate the attempt; late results/failures/finalizers cannot download a file, report a stale error or clear a newer attempt.
- A same-content catalogue refresh keeps the pending action intact. The identity includes format, original hash, filename, byte count and storage encoding; it does not put megabytes of source bytes into a React key.
- The cancel action discards completion; an already-started OPFS read or queued Web Lock can still finish. This is not claimed to abort filesystem I/O. No replacement engine or source-less substitute is used.

The async JSON-export/share actions elsewhere in the library are not rewritten by this small original-file lifecycle change. The tests and claims below concern this component and archive validation.

## Executed verification

- Focused regression: 10 tests in two new files passed (four transport cases and six action-lifecycle cases). These files are included in required CI.
- Selected library/import/source/selection/slot regression: **408 tests in 17 files passed**, including the above 10; counts are not additive.
- On the baseline, seven of the original nine new checks failed, covering oversized export, pre-parse UTF-8 bounds and pending-action handling. A test-only unsupported matcher was subsequently replaced by checking the native button `disabled` property; behavior requirements were not relaxed.
- Actual installed Chrome 153.0.8010.48 reran the production-bundled SQL/OPFS fixture: import, edit, duplicate, delete/restore, new Worker reopen, portable archive and downloaded originals passed. MYB 843 bytes and KPP 731 bytes retained their exact independent SHA-256 values.
- Browser cancellation/unmount checks hold the actual CAS Web Lock, wait until the real read is queued, cancel/unmount, release and drain the lock, then verify **zero late downloads**. Hydration is not replaced with a browser mock. Unit tests additionally cover delayed errors, changed source and retry races.
- Browser page/console/request errors and remaining Workers: all zero in the checked isolated origin.

This does not certify full Studio navigation, all native formats, native-rendering parity, crash durability under every filesystem failure, mobile hardware, or production deployment. Full project typecheck/build/merge/hosted CI results are recorded in the PR after their actual completion. Existing outputs and dependency versions are unchanged.

## Reproduce

```sh
pnpm exec vitest run apps/web/src/domains/creator/brush/studio-brush-archive-integrity.test.ts \
  apps/web/src/domains/creator/brush/StudioBrushOriginalSourceActions.lifecycle.test.tsx
node scripts/verify-brush-original-source.mjs /private/tmp/brush-source-lifecycle-evidence
```
