# Vello vector brush continuation — 2026-09-19

Status: **restricted document-view integration; not a live Vello brush lane**.

The existing Vello document island now accepts persisted perfect-freehand outline strokes
whose paint semantics are representable by its existing solid source-over fill path. Material,
mask, pattern, symmetry, non-default blend and unsupported contracts retain their current owners.
The shared planner must actually produce an outline before the admission predicate claims it.
Sparse or compact round-Line plans and missing recorded pressure are not silently reinterpreted.

The Vello PathIR conversion uses the same two-decimal quadratic control/end-point rounding as
the Canvas/SVG renderer. Tests serialize PathIR back to the exact existing SVG path spelling.
The SVG hot path still builds its string directly, without allocating an intermediate PathIR.
The retained stroke-width floor is matched to StudioDrawNode.

## Verification

The six-file suite covers scene lowering, document presentation, Perfect Freehand geometry,
outline contracts, StudioDrawNode and SVG export. All 320 tests passed locally. The full
frontend TypeScript check and changed-source ESLint check passed. The jsdom render suite
prints an existing HTMLCanvasElement.getContext implementation warning; it is not evidence
of a hardware GPU test or a browser rendering pass.

```sh
pnpm exec tsc -p tsconfig.json
pnpm exec vitest run \
  apps/web/src/domains/creator/render/studio-document-scene-lower.test.ts \
  apps/web/src/domains/creator/render/studio-document-scene-present.test.ts \
  apps/web/src/domains/creator/studio-perfect-freehand.test.ts \
  apps/web/src/domains/creator/studio-outline-stroke-contract.test.ts \
  apps/web/src/domains/creator/brush/StudioDrawNode.test.tsx \
  apps/web/src/domains/creator/export/studio-svg-export.test.ts --maxWorkers=1
```

## Remaining boundary

The unchanged viewport gate still requires a supported exclusive-vector page and its
select-mode/no-selection/exact-projection conditions. Mixed media pages and active pen input
are not promoted. A direct Vello live surface, mixed-page compositor, mobile/physical-stylus
validation and broader brush families remain separate integration work. Source contracts,
not updated library defaults, remain the authority for previously saved strokes.
