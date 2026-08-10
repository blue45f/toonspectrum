# ink-modeler — google/ink-stroke-modeler WASM PoC artifact (ADR-0009 / ADR-0011 lane 3)

Committed reproducible build of Google's stroke modeling library plus a
first-party C bridge, used by `../ink-modeler.ts`. Same release-contract idea
as `crates/studio-engine-vello/pkg` and `packages/studio-hokusai-wasm/pkg`:
generated artifacts are pinned by `INTEGRITY.sha256`, never hand-edited
(the two-line `@generated` + `eslint-disable` banner on the `.mjs` is part of
the pinned bytes). Verified by `scripts/verify-studio-engine.mjs`.

## Provenance

- Upstream: <https://github.com/google/ink-stroke-modeler> (Apache-2.0)
- Commit pin: `f2388813b0b25bc3e33d143d369a8367ab2e30c8` (depth-1 clone, 2026-08-08)
- Bridge source: `ism_bridge.cc` (this directory — the only first-party C++ in
  the artifact; upstream sources are NOT vendored into this repo)
- Toolchain: emsdk emcc 6.0.6, cmake 4.x (`/opt/homebrew/bin/cmake`),
  abseil-cpp `bc257a88f7c1939f24e0379f14a3589e926c950c` (20250512.0, fetched by
  upstream CMake FetchContent)

## Rebuild

```shell
git clone https://github.com/google/ink-stroke-modeler ~/toolchains/ink-stroke-modeler
cd ~/toolchains/ink-stroke-modeler
git checkout f2388813b0b25bc3e33d143d369a8367ab2e30c8
cp <this-dir>/ism_bridge.cc bridge/ism_bridge.cc
source ~/emsdk/emsdk_env.sh
emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release \
  -DINK_STROKE_MODELER_BUILD_TESTING=OFF -DINK_STROKE_MODELER_ENABLE_INSTALL=OFF
cmake --build build-wasm -j8
em++ -O3 -std=c++20 -I. -Ibuild-wasm/_deps/abseil-cpp-src bridge/ism_bridge.cc \
  build-wasm/lib/libink_stroke_modeler_*.a \
  $(find build-wasm -name "libabsl_*.a") \
  -o bridge/out/ink_stroke_modeler.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createInkStrokeModelerModule \
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sASSERTIONS=0 \
  -sEXPORTED_FUNCTIONS=_ism_create,_ism_destroy,_ism_reset,_ism_update,_ism_results_ptr,_ism_result_stride \
  -sEXPORTED_RUNTIME_METHODS=HEAPF64
```

Then re-apply the two-line banner to the generated `.mjs`, copy
`ink_stroke_modeler.{mjs,wasm}` here, and refresh the manifest:

```shell
shasum -a 256 README.md ink_stroke_modeler.mjs ink_stroke_modeler.wasm ism_bridge.cc > INTEGRITY.sha256
```

## Boundary

- `.mjs` is an emscripten MODULARIZE + ES6 factory (`createInkStrokeModelerModule`),
  web + worker + node; the wasm is located via `import.meta.url` (override with
  `locateFile`).
- Exported C surface (see `ism_bridge.cc`): `ism_create` / `ism_destroy` /
  `ism_reset(params…)` / `ism_update(eventType,x,y,tSeconds,pressure)` /
  `ism_results_ptr` / `ism_result_stride` — results are doubles, stride 6:
  `[x, y, tSeconds, pressure, vx, vy]`.
- Prediction is not exposed (PoC contract: deterministic, no predicted
  extension). Quarantine status + measured numbers live in
  `docs/adr/0011-v12-frontier-quarantine-ledger.md` lane 3 and
  `tests/benchmarks/results/ink-modeler-poc.json`.
