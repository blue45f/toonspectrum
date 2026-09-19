# Scene3D follow-up delivery — 2026-09-20

> This previously uncommitted follow-up was preserved and integrated by the
> [selected-object design execution wave](./studio-scene3d-inplace-design-wave-2026-09-20.md).
> Its final commit-bound revalidation is recorded there; counts below describe the original
> follow-up verification and must not be added to or substituted for the final current counts.

## Scope actually completed

Extends integrated PR #1844 (which already contains the normal/crease output work from #1838)
with executable texture-release functionality and the three newest review fixes. It does not label
all items in the open-ended long-term research roadmap as shipped, or authorize deployment.

### KTX2 + LOD derivatives

`ktx2-encoder@0.6.0` is now an exact runtime dependency, consumed in a one-job-per-Worker tool.
The existing professional asset tools expose UASTC/ETC1S color-texture encoding, 512/1024/2048
maximum image edge, and a combined LOD+KTX2 release action. The latter encodes texture images
once, generates three independent static-mesh LODs and exports a hash/measurement receipt.
Original files, canonical scene/character state and catalog admission remain unchanged.

Actual rules, not metadata-only support:

- Embedded PNG/JPEG/static WebP/KTX2 images are header-inspected before decoder/GPU allocation.
- Processing and the automatic artifact viewer both enforce 4096-pixel image dimensions and a
  conservative aggregate 64 MiB decoded-image ceiling. Encoded file size is not a decode budget.
- KTX2 output base dimensions are 4x4-block aligned; conversion never silently strips unsupported
  resources, unknown extensions, VRM data, or animated/skinned content through a static LOD path.
- Color textures retain sRGB transfer. Normal/data textures always use linear UASTC.
- Reused images with incompatible color/data or normal/non-normal material slots are rejected.
- Mip filtering explicitly follows the selected transfer; normal mip vectors are renormalized.
- Basis 2.50's default BT709 primary annotation is corrected to unspecified for non-color glTF data.
  Encoded blocks/alpha/orientation are not edited by this DFD-only annotation correction.
- The actual KHR_texture_basisu GLB is reopened, structurally validated and GPU-transcoded for preview.
- Returned errors retain validated input/unsupported/budget/cancelled/timeout/runtime codes.

The package's pinned JavaScript glue is patched using the already verified static Embind/emval
invokers. The WASM kernel is unchanged and the production CSP is not weakened. A Node test runs
the real encoder under `--disallow-code-generation-from-strings`; a separate browser proof uses
the actual built Worker with the exact production CSP from `dist/_headers`.

### Capture working-set admission

Color-only and legacy depth-only budgets remain unchanged. Color+depth+normals now have their own
conservative 80-byte-per-pixel / 320 MiB working-set bound, including concurrent GPU targets,
readback and owned CPU copies. The normal-inclusive maximum is therefore 2048-square (4,194,304
pixels); an oversized request fails before invoking any renderer. This is an explicit limit, not a
hidden renderer fallback/downscale. Full-resolution tiled 4K normal/LT output is not claimed.

### CI defects corrected without bypassing checks

- The focused sparse checkout includes the two real environment/character metadata directories.
  The actual `git sparse-checkout check-rules` command verifies those paths are present and unrelated
  large assets stay excluded.
- Desktop release tests build the sync agent before packaging instead of depending on a previous
  local `dist` directory. The pre-existing local output was backed up before verification.
- Market asset reports retain hash, byte length, admission metrics and issues, not the full binary
  `verifiedBytes` typed array. The real 334-file/six-model audit now produces bounded JSON.
- The 2D audit tests match the retained nine original files/five aliases, and preserve the
  small-image recommendation rejection using a real isolated temporary fixture. Audit roots
  are honored instead of silently reading the main checkout's files.

A separately investigated global menu/i18n fallback change was not included: it is outside the
3D follow-up and has unrelated dictionary-suite debt. No global translations or UI assertions
were weakened to obtain a passing 3D merge.

## Validation evidence

All measurements below are bounded fixture evidence, not blanket claims for arbitrary production
models or all mobile devices. Individual test suites overlap and must not be added as independent
coverage. Updated JSON proof is stored beside this report before merge.

- Specialist suite: 9 files / 77 tests passed.
- Professional completion: 34 files / 204 tests passed.
- Capture/client review regression: 3 files / 59 tests passed.
- Desktop self-contained archive tests: 3 passed, including reproducibility and tamper checks.
- 2D byte/hash/quality audit: 14 tests passed.
- Market audit: all 334 pinned files and six GLB models passed; JSON size 245,365 bytes.
- Production bundle, third-party notices and static CSP validation passed.
- Production Worker executes all 12 actual operations, including both texture codecs and combined release.
- Actual UI file input → LOD+KTX2 → real compressed-texture preview → GLB download passed.
- Both original color/alpha and varied directional normal maps are compared through real GPU sampling.
- Remaining upstream BVH deprecation warnings are retained. Existing unrelated site-wide workflow
  failures are not evidence of this feature passing and must not be reported as all-green CI.

Reproduction:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run verify:studio-3d-specialists
pnpm run verify:studio-3d-professional-completion
pnpm run test:desktop-sync-release
node --test scripts/studio-2d-asset-quality.test.mjs
pnpm exec tsx scripts/verify-market-cc0-bytes.mts
pnpm run build:bundle
SCENE3D_SPECIALISTS_PRODUCTION_WORKER=1 \
SCENE3D_SPECIALISTS_GPU_LANE=swiftshader \
node scripts/verify-studio-scene3d-specialists.mjs
```

The whole-site shell is not automatically certified by the isolated specialist page. No production
deployment, universal file-size improvement, all-material parity, or 30-minute soak is inferred.
Full NPR effects, live GPU XPBD, canonical full-body VRM IK, streaming/culling kernels and the
other research-stage engines remain distinct from the delivered derivative/reference tools.
