# Character naturalness wave 2 — 2026-09-05

Base: PR #749, `09a835a3eaa5de6e0e25cdf28e4eb104e3db3f57`.

## Implemented

- Added bounded transactional finger-contact refinement: retain only improving trials, restore the previous best after a rejected trial, and restore the initial pose after a measurement exception. Preserve existing rotation signs and do not further grow already-over-limit joints.
- Connected the new refiner to `StudioVrmPoserViewport` at frame priority -1.5, after base pose (-3) and prop IK (-2), before VRM commit (-1). This replaces the effect-time refiner in this viewport only.
- Respect auto-grip authority, conflicts, missing or locked finger bones, and editing/tracking/broadcast exclusions. Extra tightening applies only to cylinder/handle grips, not phone-like flat, precision-pinch or support profiles.
- Use the selected anchor radius and resolved prop scale. Include eligible fully influenced secondary contacts and reject targets outside the hand contact region.
- Cache baseline/output rotations with contact and rig-transform signatures; replay the cached correction after base pose rather than repeatedly amplifying it. Release only the correction still owned by this pass.
- Add landmark-based closeup, eye and bust regions using head/neck/eyes/chest/shoulders. Reuse the perspective fit with the portrait lens and viewing direction. Keep custom cameras untouched and preserve fallback for incomplete rigs.
- Ignore hidden, off-layer, fully transparent and malformed primitives during camera-bound measurement. Hold pending camera changes during capture/broadcast. Reset zoom and handle vertical views on explicit framing commands.

## Verification actually completed in this session

- Strict standalone TypeScript compilation of `studio-vrm-contact-refinement.ts` and `studio-vrm-portrait-framing.ts` using `--strict --target ES2022 --module commonjs`.
- Independent Node assertion harnesses against the compiled modules: contact refinement **145 assertions**, portrait regions **283 assertions**, **428 total passed**.
- TypeScript syntax/transpile diagnostics for all seven changed/new source and test files: zero errors. This is not whole-project type checking.
- Reversing the narrow viewport integration edits reproduced the original Git blob SHA `a7db32499e1afdcc33c8e4db3af0f63e4bc4df7e`, checking that the copied viewport retained unrelated behavior.
- Added two Vitest regression files. They have not been run under the repository's Vitest/dependency environment in this session.

## Remaining gates and scope limits

Whole-project lint/typecheck/build, the Vitest suite, and real VRM/GLB browser visual comparisons remain unverified. The available local environment has no repository dependencies/network checkout, and no remote desktop device is connected.

The old legacy refiner still exists for other consumers, including the separate bg3d runtime; this change does not claim parity across every export or 3D surface. Joint-origin distance is not fingertip-to-mesh collision detection. Portrait regions are conservative landmark estimates, not exact head-mesh segmentation. Arbitrary models, parent shear, prop penetration and all camera/undo/capture combinations still require real-model testing.

Deployment investigation found the previous production build still serving and a Vercel `api-deployments-free-per-day` quota error on PR #749. Do not treat a preview from an earlier commit as validation of this head. Main merge requires the current head plus current main to pass the required `core` CI; do not bypass it.

Suggested focused repository checks:

```sh
pnpm exec vitest run src/domains/creator/vrm/studio-vrm-contact-refinement.test.ts src/domains/creator/vrm/studio-vrm-portrait-framing.test.ts src/domains/creator/vrm/studio-vrm-hand-poses.test.ts src/domains/creator/vrm/useStudioVrmPoserPoseEdit.hand.test.ts src/domains/creator/vrm/studio-vrm-preview-framing.test.ts src/domains/creator/vrm/studio-vrm-secondary-hand-contact.test.ts
pnpm run typecheck
pnpm run build
```
