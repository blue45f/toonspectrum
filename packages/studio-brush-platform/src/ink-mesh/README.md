# ink-mesh — google/ink brush-geometry (mesh) WASM artifact (ADR-0011 lane 3, V12 §11.2)

Committed reproducible build of the google/ink stroke **mesh generation** lane
(BrushTip geometry -> InProgressStroke incremental mesh), used by
`../ink-mesh.ts`. The retained single-shot ABI and the V12 next-stage
`InProgressStroke` retain-and-replace delta ABI are built from the same bridge.
This remains the geometry/brush/stroke subset only (no Android rendering
utilities), and is the sibling of the
`../ink-modeler/` artifact (stroke input modeling). Same release contract:
generated artifacts are pinned by `INTEGRITY.sha256`, never hand-edited (the
two-line `@generated` + `eslint-disable` banner on the `.mjs` is part of the
pinned bytes). Verified by `scripts/verify-studio-engine.mjs`.

## Provenance

- Upstream: <https://github.com/google/ink> (Apache-2.0, module version 1.1.0)
- Commit pin: `1d0daba661f3035f42f3649b8e6a0061b47aa759` (depth-1 clone, 2026-08-08)
- Bridge source: `imk_bridge.cc` (this directory — the only first-party C++ in
  the artifact; upstream sources are NOT vendored into this repo)
- Toolchain: emsdk emcc 6.0.6. Upstream is **Bazel-only** (MODULE.bazel, no
  CMake), so the build compiles a measured source subset directly with em++
  instead of the upstream build system (same strategy as `../libmypaint/`):
  76 translation units from `ink/{types,color,geometry,brush,strokes}`,
  excluding tests/benchmarks/fuzz/JNI and `ink/geometry/tessellator.cc`.
  Measured consequence: the subset needs **no libtess2, no Skia, no protobuf,
  no Dawn** — those upstream deps belong to the rendering/storage/JNI lanes.
- abseil-cpp: `20260526.0` LTS (`5650e9cf76d3be4318d5fa3af38ee483ddfd5e4a`),
  built separately with emcmake (the ink-stroke-modeler lane's 20250512.0
  archives are too old — ink 1.1.0 uses e.g. `absl/status/status_macros.h`).

## Rebuild

```shell
git clone --depth 1 https://github.com/google/ink ~/toolchains/ink
cd ~/toolchains/ink && git checkout 1d0daba661f3035f42f3649b8e6a0061b47aa759
git clone --depth 1 --branch 20260526.0 https://github.com/abseil/abseil-cpp ~/toolchains/abseil-cpp
source ~/emsdk/emsdk_env.sh

# 1. abseil static libs
cd ~/toolchains/abseil-cpp
emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_STANDARD=20 \
  -DABSL_PROPAGATE_CXX_STD=ON -DBUILD_TESTING=OFF -DABSL_BUILD_TESTING=OFF
cmake --build build-wasm -j8

# 2. ink subset (76 TUs -> archive)
cd ~/toolchains/ink && mkdir -p build-wasm/obj bridge/out
find ink/types ink/color ink/geometry ink/brush ink/strokes -name "*.cc" \
  | grep -v -E "_test|_benchmark|fuzz|/jni/|test_helpers|test_matchers|type_matchers|test_params" \
  | grep -v "geometry/tessellator.cc" \
  | while read f; do
      em++ -O3 -std=c++20 -I. -I$HOME/toolchains/abseil-cpp -c "$f" \
        -o "build-wasm/obj/$(echo "$f" | tr / _).o"
    done
emar rcs build-wasm/libink_subset.a build-wasm/obj/*.o

# 3. bridge + link
cp <this-dir>/imk_bridge.cc bridge/imk_bridge.cc
em++ -O3 -std=c++20 -I. -I$HOME/toolchains/abseil-cpp bridge/imk_bridge.cc \
  build-wasm/libink_subset.a \
  $(find ~/toolchains/abseil-cpp/build-wasm -name "libabsl_*.a") \
  -o bridge/out/ink_mesh.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createInkMeshModule \
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sASSERTIONS=0 \
  -sEXPORTED_FUNCTIONS=_imk_create,_imk_destroy,_imk_point_stride,_imk_max_points_per_append,_imk_max_stroke_points,_imk_begin,_imk_append,_imk_finish,_imk_cancel,_imk_generate,_imk_vertex_count,_imk_triangle_count,_imk_positions_ptr,_imk_tex_coords_ptr,_imk_indices_ptr,_imk_delta_kind,_imk_delta_base_revision,_imk_delta_revision,_imk_delta_retained_vertex_count,_imk_delta_retained_triangle_count,_imk_delta_vertex_count,_imk_delta_triangle_count,_imk_delta_positions_ptr,_imk_delta_tex_coords_ptr,_imk_delta_indices_ptr,_imk_input_count,_imk_tracked_vector_bytes,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF64,HEAPF32,HEAPU32
```

Then re-apply the two-line banner to the generated `.mjs`, copy
`ink_mesh.{mjs,wasm}` here, and refresh the manifest:

```shell
shasum -a 256 README.md ink_mesh.mjs ink_mesh.wasm imk_bridge.cc > INTEGRITY.sha256
```

## Boundary

- `.mjs` is an emscripten MODULARIZE + ES6 factory (`createInkMeshModule`),
  web + worker + node; the wasm is located via `import.meta.url` (override with
  `locateFile`).
- Compatibility surface: `imk_generate` and the full-mesh count/pointer
  getters are retained unchanged at the TypeScript API.
- Incremental surface: `imk_begin` starts/restarts one retained upstream
  `InProgressStroke`; `imk_append` enqueues only new real inputs;
  `imk_finish` seals the stroke; `imk_cancel` clears it. Delta getters expose
  protocol revision, operation, retained counts, and replacement tails.
  Maximums are 65,536 points per live append and 1,000,000 per stroke.
- Input points are **pre-modeled** (stride 6 doubles: x, y, tSeconds,
  pressure, tiltRadians, orientationRadians) and are fed through
  `BrushFamily::PassthroughModel` — the modeled
  output of the `../ink-modeler/` lane connects here without a second
  smoothing pass. Optional-channel presence must stay consistent within a
  stroke. `noise_seed` is fixed to 0.
- TypeScript protocol `toon-ink-mesh-delta-v1` uses
  `baseRevision/revision + retainedVertexCount/retainedTriangleCount + tails`.
  `append` never truncates, `update` replaces a changed tail, and `noop`
  advances the revision without geometry bytes. Applying it requires no GPU
  readback.

## Focused verification

```shell
pnpm exec vitest run \
  packages/studio-brush-platform/src/__tests__/ink-mesh.test.ts \
  packages/studio-brush-platform/src/__tests__/ink-mesh-incremental.test.ts \
  tests/visual/ink-mesh-vello-smoke.test.ts
pnpm exec tsx tests/benchmarks/harness/ink-mesh-incremental.ts
shasum -a 256 -c packages/studio-brush-platform/src/ink-mesh/INTEGRITY.sha256
```

Candidate comparison and measured evidence live under
`docs/candidates/ink-mesh-incremental/` and in
`tests/benchmarks/results/ink-mesh-incremental.json`. Product promotion still
depends on the physical-stylus/CSP blind quality gate; the single-shot path is
the mandatory fallback.
