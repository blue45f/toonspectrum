# GPU document renderer continuation — 2026-09-22

Status: implemented migration slice; validation and review are required before promotion.

## Scope and preserved work

The original unfinished Skia worktree was read before continuation. Overlapping edits were observed in the same files, so all tracked and untracked changes were preserved into `feat/skia-primary-validation-20260922` in a separate, locked worktree. The original worktree was not reset. Automerge dependency/history work remains separate and is not included.

## Delivered code

- CanvasKit 0.41.1 WebGL2 document surface wired to the actual viewport DOM overlay, exact-revision acknowledgements and the existing committed-stroke display fence.
- Original versioned ordinary pen/marker pressure, nib and paint contract; retained geometry and finalized direct eraser semantics. Unsupported visible content is never omitted or approximated.
- Per-item pictures and 128-item composite batches; append paints the new item instead of replaying all old items. Metadata comparison still scales with document length.
- Latest-frame queue while loading, bounded current projection cache, picture and snapshot budgets, explicit GPU teardown. Camera scrolling reads the same Stage transform as hit testing.
- Resize invalidates viewport texture generations. Wrong-revision results, late success after device loss and stale/unmounted work cannot reactivate hidden pixels.
- Same-engine recovery is explicit. No CPU render/readback is introduced into this GPU renderer. Tests may read pixels only to check parity.

## Reproducible validation

```sh
pnpm run typecheck
pnpm exec vitest run packages/studio-engine-skia/src/__tests__ apps/web/src/domains/creator/render/StudioSkiaDocumentSurface.test.tsx
# Local Vite server in a separate terminal; canonical /tools/browser-harnesses URL
node scripts/verify-studio-skia-document-engine.mjs http://127.0.0.1:<port>
```

The GPU harness uses the actual CanvasKit runtime and actual causal ink projector. It compares pen/marker/eraser pixels to the existing canonical drawing path, tests resize/DPR/rotation/reflection, interleaved contexts, 3,000 and 10,000 strokes, exact snapshot return, bounded repeated view changes and explicit device-loss recovery. `frameMs` is CPU submission time; it is not GPU completion, physical pen latency or full editor FPS. Driver cache usage can be unavailable and must stay null rather than zero.

An actual `/studio/canvas` local probe was also attempted without production credentials. It was blocked by the existing local collaboration/durability readiness gate with the API offline. No permission or durability guard was bypassed; that probe is not reported as successful full-editor validation.

## Deliberate remaining boundaries

The editor still uses Konva input/selection and the committed-stroke handoff. Complex visible text/image/frame/mask/filter/natural-media scenes and active eraser editing keep their pre-existing compatibility path. Export, 30/120-minute physical-device testing and complete input/brush ownership migration are not claimed by this change. No production deployment, DB, user data, package-version or CI limit change is included.
