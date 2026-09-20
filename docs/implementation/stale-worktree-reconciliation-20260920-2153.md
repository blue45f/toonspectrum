# Idle worktree reconciliation — 2026-09-20

Status: reviewed source-history integration; not a production deployment or full-suite certification.

## Completed input-lifecycle source

- Reviewed baseline: `6c8b07a9199951c1e88c118a498e586c8a3f7dc5`.
- Source branch: `feat/brush-shared-input-lifecycle-20260920`.
- Original five-file snapshot is preserved in commit `200a693f9`.
- The source files were last modified at 12:19–12:21 KST; the scoped working-directory process check found no process using that worktree before it was claimed.
- Four implementation files were byte-identical to current main: velocity pressure, material runtime, material input conversion, and material pointer pressure.
- The old lifecycle test had already been incorporated into main. Main additionally tests synchronous capture release, repeated disposal, refused pointer capture, and transport changes between strokes, with corrected TypeScript overloads.
- The add/add conflict deliberately retains that complete current-main test. No runtime implementation or existing regression is replaced with an older version.
- The integration commit records the original source as ancestry so cleanup does not leave an unreachable WIP change.

## Verification

Executed on the reconciliation worktree with the existing source worktree's dependency installation:

```sh
node node_modules/vitest/vitest.mjs run apps/web/src/domains/creator/brush-lab/brush-studio-live-input-lifecycle.test.ts apps/web/src/domains/creator/brush/studio-material-brush-runtime.test.ts apps/web/src/domains/creator/studio-cuttoon-editor/studio-cuttoon-material-pointer-pressure.test.ts --maxWorkers=2
```

Result: **3 suites, 30 tests passed**. The initial main dependency installation lacked `colormix`; no shared installation was purged or changed. Snapshot commit hooks passed lint and secret scanning.

## Remaining source boundaries

The old visual-motion, visual-polish, storage-acceptance, and other dirty/locked worktrees are not certified by this change. In particular, historical private-storage/correction QA scripts are not currently in main and must not be called completed merely because related feature commits were cherry-picked. Recently resumed brush-original, navigation, meeting, fortune, workspace, and handoff work is preserved. Branch protection, required CI configuration, production services, and production data are unchanged.
