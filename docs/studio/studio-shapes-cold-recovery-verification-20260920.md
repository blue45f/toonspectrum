# Smart Shape cold recovery verifier — 2026-09-20

Status: verifier repair; product runtime and rendering code unchanged.

## Distinct failures and evidence

- PR #1856 run `6b3` failed after a cold reload while waiting for **원래 자유선 복원**. The failure artifact retained six exact durable draws, including the corrected stroke and its original snapshot, but the command had reported **교정할 펜 스트로크를 먼저 그려 주세요.** An absent recovery notice does not establish hydration completion: the notice is initially absent before the asynchronous storage read. Reading already-saved SQLite data also does not establish that the current page contains those strokes.
- The original verifier on the integrated NEW checkout `b7f03919cdfbabc08d74052ef13d61b676f205f5` rendered and persisted all six shape fixtures, then timed out opening the first correction menu. The captured menu was closed. An earlier OLD run passed cold recovery and failed at the same menu entry after extreme zoom. These are menu-entry failures, not evidence of lost correction metadata. The artifacts do not identify the precise pointer-event ordering responsible for every menu failure.

The repair is in `scripts/lib/studio-verify-shape-readiness.mts` and `scripts/verify-studio-brushes.mts`:

1. Keep the exact durable correction comparison, then require **every expected stroke ID in the live current-page layer tree**, with no recovery notice remaining. The wait handles a notice that appears late and, if the product offers a manual recovery action, invokes that action once. A blocked/failed restore fails the gate. The existing eight-second recovery budget is shared across the observation and manual action.
2. Open the shipped Create menu through its focus + `ArrowDown` interaction. This opens a closed menu or focuses an already-open menu without issuing a second pointer toggle. The actual correction menu item is still clicked, and the real dialog is still required.
3. Record live layer IDs, recovery UI and menu expansion state alongside durable data on failure. Record the exact restored IDs before reopening the correction dialog.

The subsequent **원래 자유선 복원** action, exact original-stroke comparison, point-edit Undo/Redo, correction Undo/Redo, six shape pixel/bounds assertions, mobile touch targets and extreme zoom/rotation checks remain required. No timeout, error allowlist, CI exclusion or product authority rule is relaxed.

## Verification scope

- The helper regressions execute the browser predicates against changing DOM frames, including late auto/manual recovery, wrong/missing live IDs, blocked/busy recovery and failed recovery without retries. Menu regressions render the actual `StudioMainMenu`, exercise the helper against both initially open/closed states, and select its real command once without a canvas Escape.
- The new suite is registered in `scripts/ci-required-vitest-targets.txt`; the existing shard-routing contract checks that the complete manifest stays sorted, unique and fully partitioned.
- Browser runs use the existing NEW production `dist/` as authorized for this script-only repair. They do not constitute a fresh build of the integrated source. The default shapes lane is a functional browser check, not a hardware-GPU capability, quality benchmark or performance measurement.
- Two attempted repaired runs stopped **before either repaired path**: one during the existing twelve-second editor boot wait, one when the second rectangle gesture produced neither live ink nor a durable stroke. Both artifacts report zero browser errors. Concurrent host load was observed, but is not established as the sole cause. These runs are failures, not passes or evidence of successful cold restoration.

Final results:

- Two Vitest suites: **18/18 passed** (eight helper regressions plus ten existing actual Smart Shape editor mutation tests).
- Required-shard Node contract: **8/8 passed**. Scoped ESLint with `--max-warnings=0`, standalone helper TypeScript check and `git diff --check`: exit 0.
- Final functional production-preview browser run: **exit 0**, `studio-brush-shapes-report.json` has `ok: true`, six `persistenceMatched: true` / `visualChanged: true` fixtures and `errorCount: 0`. The recovery receipt has six expected/live IDs, the corrected ID present and zero recovery notices. The same run passed exact original restoration and 320px dialog controls, then all edit kinds at **24.67% / 90°** and **616.67% / 180°**, with each preview path inside its viewport.
- Artifacts: `/tmp/virtual-studio-shapes-final-20260920/`; console log: `/tmp/virtual-studio-shapes-final-20260920.log`. The recovered-ID receipt is `studio-smart-shape-cold-recovery.json`; mobile evidence is `studio-current-stroke-correction-mobile.png`; extreme-view geometry is `studio-smart-shape-extreme-views.json`.

The final command preserved the CI stage and flags:

```sh
TOONSPECTRUM_BRUSH_VERIFY_STAGE=shapes \
TOONSPECTRUM_BRUSH_STABILITY_ROUNDS=2 \
TOONSPECTRUM_BRUSH_SURVEY=1 \
TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX=1 \
TOONSPECTRUM_BRUSH_VERIFY_DIR=/tmp/virtual-studio-shapes-final-20260920 \
pnpm_config_verify_deps_before_run=false pnpm run verify:studio-brushes
```

This is the **shapes stage only**. The verifier correctly declined to issue the full brush-wave receipt because the other stages were not executed in this run. A fresh CI run remains the verification of the integrated source/build on its runner.
