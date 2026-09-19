# Full-suite worktree reconciliation — 2026-09-20

Status: recovered and locally validated; PR #1827 remains draft. No main merge or deployment.

## Sources and preservation

- Published starting head: `02e48803553a15d4836d42c4c729b997f56da036`.
- Reviewed worktree: `toonspectrum-full-suite-finish-20260920`, based on `7836ec8a0`.
- Earlier worktree: `toonspectrum-full-suite-repair-20260919`, local head `ed03d6b68`.
- Recovered 375 tracked and 5 untracked source files from a hash-checked snapshot.
- The older worktree's 370 pending files are covered by 366 recovered files and 4 explicit
  thumbnail/catalogue exceptions. No original source worktree was reset, stashed or overwritten.
- The two local-only merge commits were inspected. Their only combined-diff change is a duplicate
  `floatingLayoutsSource` declaration; the corrected current declaration must remain single.

## Explicit exceptions

Keep the published draft diagnostic workflows and main QA workflow unchanged.
Leave the unreviewed integration-runner CI-contract rewrite in its original worktree.
Preserve main's reviewed thumbnail bytes, manifest and corresponding VRM catalogue rather than
reintroducing older recompressed images. Existing thumbnail regressions pass with this choice.
Other active brush, 3D and virtual-world feature worktrees are not folded into this test-repair PR.

## Integration repairs and validation

- Preserve normalized stored language and document locale during hydration; defer translation
  loading to the existing `useT` effect so store construction cannot enter a partially initialized
  circular loader. Add a regression proving first use loads the restored language.
- Match the background history assertion to the current visible `최근 사용` copy while retaining
  SQLite hydration, preset selection and persistence assertions.
- Build the desktop sync CLI locally before its real reproducible-release/tamper test.
- Combined targeted verification: **91 files / 925 tests passed**, no unhandled rejections.
- This is not a claim that the full repository suite, remote CI or production deployment passed.

## Snapshot boundary

Captured at: 2026-09-20T03:44:52.040460.
The original worktree remains writable by its existing session. Subsequent edits are not silently
assumed to be included in this snapshot.

Files changed in that source after this snapshot was captured:
- None among the recovered files at the pre-commit comparison.
