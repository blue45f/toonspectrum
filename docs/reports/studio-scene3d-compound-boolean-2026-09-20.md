# Scene3D compound Boolean implementation — 2026-09-20

Status: implemented on an isolated branch; final validation and PR publication in progress.
Base main: `5d1cd7ace7f166e932077b5d4733836012b633b3`.
PR #1849 was already merged before this continuation. Its merge SHA is `3f6cafdb552d4e1b771e98b0f356117297a96a79`.

## Current product change

The existing Manifold solid mode now accepts up to 32 mesh nodes per source GLB.
Primitives within one mesh node are joined and position-welded to reconstruct material-split closed surfaces.
Different mesh nodes are combined using balanced pairwise **real Manifold unions**, not concatenation of overlapping triangle soups.
The two resulting operands then perform union, difference, or intersection.
World transforms, negative determinant winding, and disconnected solid components are handled by the existing geometry and solid contracts.
`boolean-solid.glb` is accompanied by `boolean-report.json`, binding both source hashes, the output artifact hash, node/primitive counts, intermediate receipt hashes, topology, volume, and cumulative work estimate.
Volume is in source-units cubed; no meter conversion is implied.

## Preserved boundaries

- No library or lockfile change; existing pinned Manifold/Three/glTF infrastructure is reused.
- Textured inputs remain unsupported. Output is geometry-only: source material appearance and UVs are not preserved.
- BVH preview remains single-primitive; compound input gets an explicit instruction to choose Manifold solid.
- Each mesh node must collectively describe an oriented closed solid. Open/degenerate input and empty output are rejected, not silently repaired.
- This remains a derived-file workflow, not direct Boolean mutation of Scene3D or CharacterDocument history.
- Source bytes are not overwritten or detached. Existing Worker cancellation and queue admission remain in force.
- Other active tile-export, recipe-reuse, and comparison-preview worktrees were not modified.

## Admission and lifetime

Combined file input remains limited to 128 MiB and 100,000 input triangles.
Each source has a 32-mesh-node cap, checked before accessor copying/dequantization for this lane.
Per-node/intermediate vertices are bounded by the existing 250,000-vertex provider limit; intermediate triangles are capped at 100,000.
Cumulative pairwise work estimates may not exceed the existing 2,000,000,000-unit ceiling.
The existing 1e-6 weld tolerance is explicit in the report, in source coordinate units.
All owned Three geometries are disposed, and the Manifold provider is destroyed even on failure.
The provider continues deleting every native input/output handle after each operation.

## Verified behavior

- Native WASM compound suite: 12 tests pass, including the advertised 32-node boundary, open-surface rejection, mirrored/nonuniform parent transforms, shared-mesh instances, and empty intersection.
- Overlapping two-part operand vs one cutter: union/difference/intersection volumes are 14/6/6; independently decoded output GLBs agree.
- Both operands with disjoint parts: intersection volume 12. Multi-level composition produces volume 38 and releases all 18 native handles.
- A 32-node source executes 32 solid operations and produces volume 258 in the synthetic union fixture.
- Initial specialist regression: 11 files / 109 tests passed before the final three added boundary/lifetime tests; do not add overlapping suite totals.
- Professional completion regression: 34 files / 206 tests passed.
- Production bundle, third-party notices, static CSP, and optional engine startup-isolation verification passed.
- Actual built Worker (`specialist.worker-BLThVZHd.js`) ran with the production Worker CSP. All 15 successful operation cases, including three compound cases, passed.
- Worker queue/cancellation proof retained maximum one processing Worker; final active/queued/input-reservation counts are zero.
- The existing UI executed two-file compound subtraction, previewed it, and downloaded the GLB and hash-bound JSON report. Expected volume 6 was confirmed.
- Existing LOD, KTX2 GPU transcode/download, Spark rendering/close, and artifact navigation checks also passed.
- Chromium 151.0.7922.34 on SwiftShader reported zero browser errors; two upstream BVH deprecation warnings remain visible.
- This is production-Worker/CSP plus source UI harness evidence, not a deployment or exhaustive hardware/authoring-corpus certification.

## Verification diagnostics and limits

An initial full web type check with an explicitly reduced 4 GiB Node heap aborted from memory exhaustion; the repository's 12 GiB setting is used for the final rerun. This is not counted as a passing check.
The first browser attempts timed out waiting for the generic page `load` event. The verifier now waits for navigation commit and then its existing real completion signal, preserving the original 90-second proof gate and every operation assertion.
The initial new UI step used an exact wrapped-label match; select labels also include option text. The selector now matches the label prefix and still performs real control changes, processing, downloads, volume checks, and preview checks.
No runtime deadline, memory admission, source preservation, CSP, test count, or assertion was weakened to obtain a pass.
The production build retains existing import-meta, upstream eval, and VRM compatibility warnings. Build success is not a claim of zero warnings or all renderer features being supported.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run apps/web/src/domains/creator/scene3d/specialists --maxWorkers=2
pnpm run verify:studio-3d-professional-completion --maxWorkers=2
NODE_OPTIONS=--max-old-space-size=12288 pnpm exec tsc -p tsconfig.json
pnpm run build:bundle
node scripts/verify-scene3d-specialist-bundle.mjs
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 SCENE3D_SPECIALISTS_GPU_LANE=swiftshader \
  TOONSPECTRUM_VERIFY_DIR=/tmp/scene3d-compound-proof \
  node scripts/verify-studio-scene3d-specialists.mjs
```

Screenshots, GLBs, browser proof JSON, and raw logs are generated outside tracked source. The existing CI specialist directory test and browser verifier automatically include this new coverage.
Not implemented here: material/UV-preserving CSG, topology repair, arbitrary intersecting shells within a mesh node, Scene3D direct Boolean apply, native renderer changes, or deployment.
