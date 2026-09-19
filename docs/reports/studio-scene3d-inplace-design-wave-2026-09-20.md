# Scene3D design execution — selected-object derivatives, 2026-09-20

## Delivered slice, not the complete long-term program

The 31-area / 89-task masterplan prioritizes preserving the uncommitted follow-up, then replacing
file-download/reimport loops with in-scene commands. This wave implements the static-asset slice of
source capture, revision fences, one-time application, staging/compensation, existing Undo/Redo and
canonical save/reopen. It does not claim full crash-atomic job persistence, global scheduler/admission,
rig/topology remapping, material override transfer, tiled 4K render graphs or the remaining research engines.

The previous dirty worktree was not modified. Its 33 files were snapshotted with SHA-256 inventory,
Git patches and a tar archive, then applied with a three-way patch to a separate main-based worktree.
The existing KTX2/LOD and capture-working-set follow-up is preserved in this change, including its tests.
No force push, hook/CI bypass, main merge or production deployment is implied by this implementation.

## Actual artist workflow

Existing BG3D professional tools → **3D 자산 고급 가공** → select one eligible scene GLB →
**선택 모델에서 원본 가져오기** → compression / LOD / tangents / textures / LOD+KTX2 → review →
**선택 객체에 적용** → existing Undo/Redo → save and reopen.

Standalone file tools remain usable. Applying a result never edits the original GLB. Only the selected
instance changes; another instance sharing the old model continues to use the original. Position and
rotation remain unchanged, and differing automatic normalization scales are compensated in the instance
transform. The normal history adapter records one command; Redo reuses stored artifacts, not the solver.

The direct path excludes animation, skin, morph, pose/constraints, individual material overrides,
locked ancestry and selected models with scene children. Those cases require dedicated mapping rules;
they are not silently flattened or reset. IK/Boolean/navigation remain their existing derivative tools,
not newly admitted destructive scene commands.

## State and resource ownership

- `scene3d/integration/scene3d-inplace-controller.ts` is renderer-neutral. It owns one active source
  binding, not scene data or a second history store.
- Source snapshots bind entity ID, source digest/size, document revision, selection-change epoch,
  modal session, renderer identity and cache identity. Local-file input clears the scene binding.
- Source and output hashes are recomputed; output bytes are copied before the first asynchronous step.
  Identical duplicate apply requests share a promise/receipt and do not produce a second command.
- `useStudioBg3dInplaceTools` reads current refs, capture/restore/import/physics/placement locks and
  the existing modal session. A stale result cannot overwrite a newly edited or reopened scene.
- `studio-bg3d-inplace-storage.ts` uses existing SQLite/OPFS CAS import, exact-disposition compensation,
  original rights metadata, renderer admission and the existing scene-mutation coordinator.
- New renderer resources are staged in a private cache. Full scene projection must have zero drops
  and zero diagnostics before the final synchronous command/history/state update.
- Cancellation, model-load failure and rejected final commit destroy only private resources and
  compensate only the exact newly created row. Reused cache roots are never destroyed.
- When a new session, adopted reference or later manifest makes compensation uncertain, leave the
  artifact in the library and report that explicitly rather than risking another scene's bytes.

This is not a distributed atomic transaction between all work/project records. A browser crash can
leave an unused derived asset in the content-addressed library; no global orphan sweep is introduced.
Same-tab retained history and explicit save/reopen are covered. Cross-tab project ownership/GC and
persistent recipe history remain later work.

## Real bug discovered at the product boundary

The standalone glTF Transform LOD tool produced valid meshes that its own preview could display, but
product import rejected their required `KHR_mesh_quantization` extension. The pinned Three 0.184 loader
already implements it. The canonical allowlist now explicitly includes that extension alongside
meshopt/KTX2, while preserving all digest, byte-range, accessor, compressed-payload, decoded-memory and
post-parse checks. Tests run actual generated LODs through this same allowlist and pinned decoder,
and continue to reject unknown extensions and malformed compressed buffers.

## Preserved follow-up

The recovered `ktx2-encoder@0.6.0` path adds real UASTC/ETC1S color texture encoding and independent
LOD+KTX2 release artifacts, with linear normal/data textures, mip normalization and header-based image
budgets. A pinned static Emscripten glue patch preserves the WASM kernel without relaxing CSP. The
normal-inclusive capture admission uses its own conservative 80-byte/pixel, 320MiB working-set bound;
large normal/LT output is rejected explicitly, not silently resized. Earlier safety/audit fixes remain
in the separate follow-up report. Nothing is marked globally production-admitted merely by installing it.

## Verification strategy

1. Pure transaction tests: duplicate, stale selection/source/revision/renderer, corrupted bytes,
   cancellation, compensation failures and immutable source/output snapshots.
2. Existing BG3D command adapter tests: world scale, shared instances, canonical projection,
   real Undo/Redo, durable reread before commit, exact cleanup and adopted-resource retention.
3. Product workbench routing and actual panel controls; standalone file UI remains covered.
4. Existing SQLite-WASM/CAS tests and canonical state/history regressions.
5. Real browser harness: actual library import/validator Worker, product SQLite Worker/native OPFS,
   actual Three resources and real React hooks/panel. No mocked storage or persistence is used.
6. Two production processing-Worker browser lanes: plain LOD and textured LOD+KTX2. The processing
   chunk is served from the actual build under the exact CSP from `dist/_headers`.
7. Full production bundle/notices/static CSP, optional-engine isolation, full web/API TypeScript,
   changed-source strict lint, normal pre-commit/pre-push checks and remote CI.

The browser harness is not the full site shell: processing uses the built Worker; storage/validator
use the real product module Workers loaded by the harness. It does not certify every deployment route,
all hardware or 30-minute soak. The software GPU and existing warnings are recorded, not hidden.

## Bounded observations already reproduced

The synthetic sphere starts with 1,472 triangles and its strict-LOD result has 614. Textured release
reaches the actual renderer as two compressed textures (color and normal), not just a KTX2 metadata flag.
Both paths record exactly one command, preserve the shared original instance/normalization, execute
Undo and Redo, reload the page, recover two instances and find original/derived bytes in native OPFS.
Browser errors were zero; ReadPixels and multiple KTX2-loader performance warnings remain visible.
Final code-bound evidence is recorded after final validation; overlapping test sets are not summed.

Reproduction:

```sh
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=12288 pnpm run typecheck
pnpm run verify:studio-3d-inplace
pnpm run verify:studio-3d-specialists
pnpm run verify:studio-3d-professional-completion
pnpm run build:bundle
node scripts/verify-scene3d-specialist-bundle.mjs
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 pnpm run verify:studio-3d-inplace:browser
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 SCENE3D_INPLACE_OPERATION=release pnpm run verify:studio-3d-inplace:browser
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 SCENE3D_SPECIALISTS_GPU_LANE=swiftshader pnpm run verify:studio-3d-specialists:browser
```

Generated logs and screenshots remain in `.qa/scene3d-output-quality/inplace/`. Source/tests, runtime
admission and full CI are the evidence; prior plans and old green runs are not substituted for them.


## Final executed validation

Validated code: `f7546332e1af278d437b62034ef55e0673eb06a3`, including main
`2981170a292fbe83a57b2a2913d6ddcfa3cbde74`. The following evidence commit changes documentation only.

| Verification | Result |
| --- | --- |
| Full web and API TypeScript | Passed |
| Selected-object/controller/storage/UI/history suite | 9 files / 75 tests passed |
| Specialist/texture/image/lifecycle suite | 9 files / 81 tests passed |
| Professional 3D completion | 34 files / 205 tests passed |
| Source lint and normal pre-commit checks | Passed, zero source-lint warnings |
| Workflow actionlint | Passed |
| Production bundle, third-party notices and static CSP | Passed; existing vendor warnings remain |
| Optional-engine startup isolation | Passed |
| Existing static bundle ratchet | 0 regressions, 0 unbaselined; no baseline/tolerance changes |
| Plain LOD → selected instance → Undo/Redo → actual page reload | Passed with real SQLite/OPFS |
| LOD+KTX2 → selected instance → Undo/Redo → actual page reload | Passed; two compressed textures present |
| Actual production Worker under deployment CSP | 12 specialist operations passed |
| Actual file UI/texture preview/download and Spark reference | Passed |
| Browser page/console/request errors | 0 |
| Preserved raster quality/hash audit | 14 tests passed |
| Self-contained desktop package/reproducibility/tamper audit | 3 tests passed; no signing/release |
| Bounded marketplace byte audit | 334 pinned files and six GLBs passed |

The synthetic textured sphere changed from 1,472 to 614 triangles and from 45,664 to 12,368 GLB bytes.
These numbers are fixture-specific, not universal quality/size/FPS guarantees. Both direct-apply lanes
recorded one history command and preserved the other shared instance and normalization. The original
33-file worktree snapshot was rehashed unchanged. No source backup was deleted.

Full machine-readable [synthetic validation receipt](../evidence/studio-scene3d-inplace-design-wave-20260920.json).
The receipt omits full serialized fixture bytes and records their hash/size instead. Raw logs/screenshots
stay under `.qa/scene3d-output-quality/inplace/release/`. Old runtime-startup telemetry was not remeasured.
Warnings for upstream BVH deprecation, ReadPixels and separate KTX2-loader lifetimes remain visible.
Remote CI and merge status must be checked on the actual PR; local success is not remote CI success.
