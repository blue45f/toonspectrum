# Studio asset expansion — 2026-09-13

## Delivered collection

This change adds 76 distinct assets, not color-only variants:

| Collection | Added | Notes |
| --- | ---: | --- |
| Original architectural SVG scenes | 8 | 1280 × 800 intrinsic size; scalable vector illustrations |
| Original transparent SVG props | 16 | 512 × 512 intrinsic size; separate silhouettes and uses |
| Native-2K CC0 PBR GLB models | 33 | 30 finished assets and 3 explicitly identified assembly components |
| Native-2K CC0 surface textures | 19 | Original companion PBR maps and source receipts retained |

At publication, the original selectable catalog grows from 72 to 96 assets and from 9 to 11 packages. The CC0 manifest grows from 1,212 to 1,264 entries. Existing IDs and asset URLs are preserved. Eight retired starter blockout backgrounds remain retired, but old projects can still resolve their IDs.

The eight new illustration scenes depict a café street, rainy neon alley, metro platform, reading room, greenhouse, riverside promenade, rooftop garden and artist loft. These are stylized architectural illustrations, not photographs. Their paint-server IDs are namespaced, their SVG payloads stay below the existing 30,000-character limit, and no remote images, fonts, scripts or filters are required.

## Finding and using the assets

The original marketplace exposes `아키텍처 장면 컬렉션` and `거리와 생활 디테일 소품`. Korean and English item metadata participate in the existing search, preview, local library and placement paths.

The CC0 library exposes the new localized model and texture names. The existing model workflow remains GLB download followed by Studio 3D model import; this change does not claim a new one-click 3D insertion implementation. Large model bytes are not imported into the JavaScript bundle.

Three entries are marked `assembly-component` rather than being presented as finished props: `polyhaven-hanging-picture-frame-02`, `polyhaven-dandelion-01`, and `polyhaven-shrub-sorrel-01`. Default curation hides them unless components are requested. The other 49 new CC0 entries are finished-asset selections.

## Rights and provenance

The external collection uses official Poly Haven CC0 asset files with SHA-256-bound provenance. Provider website/example render images are not redistributed; GLB previews were rendered from the acquired models. The original SVG collection uses the repository's existing original-asset CC0 license contract. No paid marketplace pack, subscription, payment flow or user-library mutation was introduced.

`selection.json` in `scripts/studio-quality-assets-20260913/` binds every visual selection to its exact candidate content hash. Two acquired models, brass candleholders and a standing picture frame, exceeded the existing mobile decoded-texture budget and were excluded. No budget was relaxed and no low-resolution image was enlarged to claim native 2K quality.

## Executed verification

Acquisition and three-view model rendering: GitHub Actions run `34733128719`.

Asset integration, complete web typecheck, targeted regressions, lint and publication: successful GitHub Actions run `34734452027`, job `103663208925`. The verified files were committed by the job in `a0d03a2c9dc57a799696dbda11b0d8872eb21b6e`.

- All 35 acquired candidate GLBs rendered nonempty images from three Chromium/Three.js viewpoints. Only the 33 mobile-admissible models were published.
- All 33 published GLBs passed the unchanged production mobile admission validator and Khronos validation with zero errors.
- All 24 new SVGs decoded in Chromium and rendered actual Canvas 2D pixels. Intrinsic size, distinct output and prop transparency were checked.
- Seven asset catalog, marketplace, placement, curation and GLB-boundary test files passed.
- ESLint passed for changed application/test files and the two new verification/publication scripts.
- `pnpm exec tsc -p tsconfig.json --noEmit` passed for the complete web application.

Verification discovered an existing circular dependency between the original expansion authoring module and the public facade. The expansion now imports the canonical base module directly. Original visuals and IDs are unchanged.

### Evidence files

- `publication-report.json`: 52 CC0 additions, rejected candidates, preserved previous identities and before/after manifest hashes.
- `admission-report.json`: per-model mobile admission and full Khronos issue counts.
- `browser-render-evidence.json`: the original candidate three-view browser rendering results.
- `illustration-browser-report.json`: per-SVG real Chromium decode/canvas metrics and content hashes.
- `visual-review.md`: SHA-bound contact-sheet visual triage decisions.

The manifest's recorded visual-review source identifies the acquisition staging path `artifacts/studio-quality-assets-20260913/visual-review.md`; its durable archived copy is `visual-review.md` beside this document. Acquisition artifacts may expire; the published assets and these evidence files are committed and do not need those artifacts at runtime. The temporary write-capable acquisition/publication workflow was removed after the verified files were committed.

### Limits of the evidence

Khronos reported **92 warnings**, all `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`: these upstream models rely on runtime-generated tangent space, which can differ between renderers. They passed the actual Three.js browser rendering checks, but this is not a claim of identical shading in every renderer. No tangent-baking rewrite was performed.

Visual triage inspected the self-rendered first-view contact sheets and the surface images. Three-view technical rendering is not all-angle artistic approval. A complete Studio import/place/save/reopen round trip for every asset, production deployment and production-browser smoke tests were not performed by the asset publication job. Evidence flags intentionally remain false for those claims.

## Rechecking source integration

With the repository's locked dependencies installed:

```sh
pnpm exec vitest run \
  apps/web/src/domains/creator/catalog/studio-quality-assets-20260913.test.ts \
  apps/web/src/domains/creator/catalog/studio-original-2d-asset-placement-contract.test.ts \
  apps/web/src/domains/creator/studio-original-free-asset-packs.test.ts \
  apps/web/src/domains/creator/studio-cc0-asset-delivery.test.ts \
  apps/web/src/domains/creator/studio-cc0-curation.test.ts \
  apps/web/src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx \
  apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation.test.ts
pnpm exec playwright install chromium
node --import tsx scripts/studio-quality-assets-20260913/verify-illustrations.mjs
pnpm exec tsc -p tsconfig.json --noEmit
```

The acquisition-dependent `prepare-publication.mjs` is a provenance/reproduction helper, not an application startup task. Its hash-bound input is documented in `selection.json`; do not relabel fresh downloads as the previously reviewed bytes.
