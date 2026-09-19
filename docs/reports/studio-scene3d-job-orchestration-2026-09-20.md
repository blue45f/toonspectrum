# Scene3D specialist job orchestration — 2026-09-20

## Continuation boundary

Continues the active `feat/scene3d-inplace-design-20260920` work and PR #1849 at
`ae9cd289cd3024583b86a0ff3c64291d60a9c660`, based on main
`2981170a292fbe83a57b2a2913d6ddcfa3cbde74`. The old dirty texture worktree and other
active sessions are preserved. This change extends, rather than reimplements, the current
selected-model derivative → apply → history → SQLite/OPFS path.

Design mapping: a working specialist-scoped slice of C03 (job states and progress) and C04
(input reservation, queue and cancellation). It does not declare either entire platform-wide
work item, or the whole 89-task roadmap, completed.

## User-visible changes

The professional asset panel now shows actual processing stages and waiting position:
waiting → preparing Worker → input contract validation → source inspection/decoding →
processing/encoding → final output verification → ready. These are real runtime boundaries,
not a timer animation, invented percentage, ETA or an unimplemented capability flag.

Queue, stage and failure messages use the existing bilingual UI and polite atomic status
announcements. Old progress after cancellation, unmount or a new generation is ignored.
Reading selected source and applying the result retain their existing separate status/locks.

## Bounded specialist scheduler

One processing Worker is active per JavaScript realm. At most five retained jobs (one running,
four waiting) share a 256 MiB **owned input snapshot** reservation. This is not a claim that total
browser, caller, WASM, output-buffer or GPU memory stays below 256 MiB. Capture, previews, Spark,
other domains and other tabs are outside this queue.

The input/options are validated first. Capacity is reserved before `.slice()` or Worker creation.
Waiting jobs retain immutable source snapshots; caller mutations cannot change a delayed operation.
Non-CSG work retains the existing rule that a stale secondary input is not copied/transferred.
Each job transfers its private snapshots only when it starts; the original files remain owned by
the caller. The old extra execution-time source copy is no longer made.

FIFO waiting time is bounded at 120 seconds. Execution keeps its own existing 120-second limit,
not extended by progress. A queued cancellation/timeout starts no Worker, drops its private
snapshot reference and updates following positions. An active cancellation terminates its Worker;
the queue slot is not reassigned until the execution promise settles. Completion, failure,
copy/construction error and cancellation all release logical reservations exactly once.

Observer exceptions cannot break resource cleanup. Reentrant starting/waiting observers and late
callbacks have regression tests. No automatic retry, persistence, cross-tab leader election,
priority class, warm-worker reuse or global VRAM eviction is introduced.

## Progress protocol

Worker progress is a versioned envelope with exact request id, strictly increasing sequence,
and one of four ordered stages. Unknown fields, replay, skipped sequence, wrong id/version and
invalid phase fail immediately and terminate the worker. Existing final-result schema validation
and specific error-code validation remain intact. Progress never resets the watchdog.

The runtime callback is invoked at actual boundaries. `processing` deliberately includes the
operation's encoding/round-trip internals; no per-triangle or per-texture percentage is inferred.
`verifying` covers the final aggregate result budget/hash contract, not a claim that every check
occurs only at that point. Existing document/source/artifact fences and commit authority are unchanged.

## KTX2 review correction

Addresses review comment `4054719581`: already-compressed KTX2 could previously skip the chosen
512/1024/2048 maximum texture edge. Both texture-only and combined-release operations now return
an `unsupported` result if a preserved KTX2 exceeds the selected edge, before treating it as a
successful release. Users must choose a compatible edge or re-encode from their original raster.
This does not pretend to resize compressed blocks or silently change their transfer/quality.

The real regression encodes a 1024×4 KTX2 GLB, rejects it at 512 in both operations without invoking
the raster decoder or changing source bytes, and preserves it successfully at 1024.

## CI input correction, without reducing tests

The previous PR head's focused-validation job `105965726491` failed to load 18 related suites
because `expansion-v1/manifest.json` was excluded by sparse checkout. The environment catalogue
and actual byte/hash/thumbnail tests require this existing pack, including six GLBs and thumbnails.
Only `/apps/web/public/assets/3d/environments/expansion-v1/` is added to that focused checkout;
unrelated asset, VRM and artifact directories remain excluded. No test is skipped or mocked away.

A real temporary Git repository using the workflow's exact sparse patterns reproduces the missing
manifest before the correction and passes afterwards. It checks source/metadata/model/thumbnail
presence and unrelated binary exclusions. The six real expansion models still pass their actual
mobile GLB admission and thumbnail tests. The local equivalent `vitest related` command passes
135 files / 1,558 tests. This local full-checkout run plus sparse-input regression is not a claim
that the remote focused job has already re-run successfully.

## Executed verification

| Check | Result |
| --- | --- |
| Specialist contracts, queue and UI | 10 files / 100 tests passed |
| In-place apply/history/storage | 9 files / 76 tests passed |
| Professional completion | 34 files / 205 tests passed |
| PR-related tests (`--pool=forks --maxWorkers=2`) | 135 files / 1,558 tests passed |
| Sparse checkout + real expansion/store tests | 3 files / 21 tests passed |
| Web and API TypeScript | Passed |
| Changed source strict lint | Passed, zero lint warnings/errors |
| Full production bundle, notices and static CSP | Passed; existing build warnings retained |
| Optional-engine startup isolation | Passed |
| Existing static bundle ratchet | Passed, zero regressions, no baseline relaxation |
| Actual built Worker with deployment CSP | All 12 existing operations and ordered stages passed |
| Additional real queue/cancellation scenarios | Passed; peak processing Workers = 1 |
| LOD selected-model apply/Undo/Redo/reopen | Passed, one history command |
| LOD+KTX2 selected-model apply/Undo/Redo/reopen | Passed, two compressed textures, one history command |

Test sets overlap and must not be summed. Native orchestration adds 17 focused tests; the KTX2
regression, visible-stage test and sparse-input regression cover separate integration boundaries.

The production Worker proof creates 16 Workers before artist-UI checks: 12 original successful
operations, three additional successful queue jobs and one active cancelled job. The additional
waiting cancellation starts no Worker. Its mutated queued source still yields the same source hash,
waiting position moves from two to one, and final state is zero active/queued jobs and zero reserved
snapshot bytes. This is logical lease accounting, not a measured physical-memory or FPS claim.

The actual LOD and release proofs use the real processing Worker, production CSP, product validator,
Three loading, existing history, SQLite Worker, native OPFS and a full page reload. In both fixtures,
1,472 triangles become 614, only the selected instance changes, the shared source/normalization
survive, Undo/Redo work, and both models reopen. All three browser proofs report zero errors.
Upstream BVH deprecation, readback performance and concurrent KTX2-loader warnings remain recorded.
The existing earlier startup-time measurement is stale; this run does not remeasure startup latency.

Evidence: [bounded validation receipt](../evidence/studio-scene3d-job-orchestration-20260920.json).
Source hashes bind the validated files before the documentation commit. Logs and synthetic screenshots
remain in `.qa/scene3d-output-quality/orchestration/`, not tracked source.

## Reproduction

```sh
pnpm run typecheck
pnpm run verify:studio-3d-specialists
pnpm run verify:studio-3d-inplace
pnpm run verify:studio-3d-professional-completion
pnpm exec vitest run scripts/scene3d-output-ci-policy.test.mjs
pnpm run build:bundle
node scripts/verify-scene3d-specialist-bundle.mjs
pnpm run check:studio-bundle
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 SCENE3D_SPECIALISTS_GPU_LANE=swiftshader \
  node scripts/verify-studio-scene3d-specialists.mjs
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 node scripts/verify-studio-scene3d-inplace.mjs
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 SCENE3D_INPLACE_OPERATION=release \
  node scripts/verify-studio-scene3d-inplace.mjs
```

## Remaining gates and roadmap

Before this continuation, PR CI also reported independent pigment declaration-scope, desktop native
SBOM/Windows Node-license and site menu/asset-library browser failures. Their logs were inspected;
this change does not claim to fix those jobs or certify all remote CI. No checks, branch protections,
CSP policies, resource limits or license verification are bypassed. Merge state must be read from the
latest PR; deployment still requires separate authorization.

Whole-platform priority scheduling, durable job/recipe cache, cross-tab capacity, output tiling,
full NPR execution, canonical VRM contact IK and GPU XPBD remain separate design tasks. This patch
does not set their global capability flags to true and adds no dependencies or new scene authority.
