# Pigment/KM integration review and ordered-layer comparison — 2026-09-20

## Scope and ownership

This branch builds on existing local commit `c06918b4982a59cde727df76a16bafad26fbb2df` (`feat/brush-spectral-km-20260920`). That commit implements the three real material pigment providers, licenses, immutable model receipts and 33-entry palette integration described in `brush-spectral-km-20260920.md`. The original worktree has unrelated pending documentation/CI edits and is not modified by this review. The review uses a separate worktree and branch, `feat/brush-km-optics-review-20260920`.

The new work is a prepared, ordered finite-layer comparison used by the actual material workbench's optical panel. It does not turn the canvas into a spectral painting surface. Selection of Spectral.js, open-km and ColorMix still affects actual material-contact colors through the existing versioned pigment providers. Optical thickness, substrate and layer-order probes are local only, do not modify brush programs, and do not read underlying canvas pixels.

## Implemented behavior

`prepareKmLayerComparison` accepts matching dense arrays of absorption K, scattering S and substrate reflectance. It snapshots inputs, validates nonnegative finite coefficients, enforces a bounded 1–256-band grid, and freezes output. Callers must supply aligned wavelengths and compatible physical units; matching array lengths alone cannot establish a physical calibration. The workbench adapter consistently uses Spectral.js's 38-band grid, RGB-reconstructed spectra and assumed S=1.

For each wavelength, the comparison produces (1) a homogeneous mixture with separately averaged K and S at summed thickness, (2) first paint over second over the same substrate, and (3) the reverse order. Thickness weights represent additive equal-area layer volumes, not grams, user opacity or physical pigment mass concentration. No intermediate spectrum is converted back to RGB between layers. Display conversion/gamut mapping occurs only after all optical composition is complete.

The existing finite-layer solution evaluates reflection R and transmission T, and composes a substrate B with `R + T*T*B/(1-R*B)`. This includes internal diffuse reflections. It is not alpha compositing, and does not include a specular interface model. The output can therefore be different from both RGB blending and pigment premixing without proving greater agreement with measured paint.

The new workbench section has two independent thickness controls, a substrate picker and three explicitly labeled output swatches. It is only mounted when the optical panel is opened. Spectral reconstruction is memoized by the color pair/substrate, so slider changes reuse prepared coefficients. It does not change the material palette resolution or historical stroke identity.

## Validation executed for this review

- Baseline inherited pigment suite: 34 tests / 4 files passed before changes.
- Updated pigment suite: 52 tests / 5 files passed. This includes 17 new layer tests and one new UI test, not 52 additional tests.
- Wider V6 regression selection: 419 tests / 21 files passed, INCLUDING those 52 tests. Existing legacy replay/provider/cache tests remain unchanged.
- Root frontend TypeScript check passed with the repository-standard 12 GiB heap. A first run at a manually reduced 6 GiB heap exhausted memory; it is not reported as a passed check.
- Pigment-folder ESLint passed with zero allowed warnings.
- Actual Chrome workbench fixture passed real provider selections, authoring JSON restore, three distinct optical swatches, empty-layer substrate identity and the assertion that optical controls do not mutate stored brush authoring state. Browser page and console errors were both empty.

Optical tests cover zero layers, single layers, identical-pigment summed-thickness equivalence, pigment/order exchange symmetry, noncommutative layers, thick top-layer limits, input immutability, sparse grids, invalid data and passive outputs. The 128 deterministic multi-band recipes are one property-style test, not 128 independent test cases. The inherited 1024-case passivity loop likewise remains one test.

Browser validation is an isolated local Vite fixture using actual workbench/provider modules. It does not prove full Studio drawing/undo/OPFS durability, mobile stylus latency, production GPU painting or deployment. The fixture uses minimal CSS and is not a production visual-regression baseline.

## Repeatable measurements

Run `node scripts/benchmark-brush-pigments.mjs .qa/pigment/optics-review`. Generated JSON/screenshots stay outside Git. The runner closes its browser and Vite server and does not use production credentials or endpoints.

Machine: Apple M2 Max, 32 GiB, Chrome 153.0.8010.48. Other independent tasks were running; load averages at collection were approximately 18.15 / 16.31 / 19.45. Absolute timings are therefore single-machine diagnostic evidence, not a performance guarantee. There are 10 warm-up passes, 31 alternating-order measurements, 128 evaluations per measurement, and a second complete measurement. Each evaluation computes all three 38-band results plus sRGB/gamut mapping. It excludes React paint, raster rendering, input-to-photon latency and persistence.

| Evaluation mode | Run 1 median / p95 (ms) | Run 2 median / p95 (ms) |
| --- | --- | --- |
| Reconstruct spectra per evaluation | 0.02422 / 0.02813 | 0.02344 / 0.02500 |
| Reuse prepared pair/substrate | 0.01719 / 0.01953 | 0.01719 / 0.01875 |

The prepared optical comparison took about 27–29% less CPU time in this fixture. This is NOT a 27–29% faster brush or GPU claim. Browser clock quantization and concurrent system load limit the precision.

At `#002185` + `#fcd200`, white substrate and both synthetic thicknesses 0.5, the resulting swatches are premixed `#00414f`, blue-on-yellow `#00247f`, yellow-on-blue `#9b9f33`. Both full measurements reproduced these outputs. Existing five-provider palette hashes also matched between repeat runs. Different engines intentionally produce different palettes; no measured-mixture accuracy ranking is inferred.

The existing actual material-path benchmark in this run reports warm 33-color palette construction medians of WGM 0.06 ms, Mixbox 0.02 ms, Spectral.js 0.06 ms, open-km 0.10 ms and ColorMix Lab 0.04 ms. Cached lookup avoids spectral evaluation per contact. The observed 1024-input contact planning time was about 2.0 ms, excluding raster drawing and presentation.

## Next work, in order

1. Introduce versioned measured-pigment assets: wavelength grid, K/S arrays and units, instrument/illuminant/observer, pigment/binder/substrate conditions, provenance/license and uncertainty. Reflectance alone identifies K/S, not independent K and S or an absolute thickness scale. RGB reconstruction must remain visibly synthetic.
2. Validate known mixtures and layers against held-out measured samples before declaring realistic presets. Record spectral error and perceptual color difference separately from timing. Color.js can be evaluated as a test-only DeltaE2000 reference; it is not needed as another production pigment engine.
3. Add explicit document state for concentrations, coating thickness, coverage and substrate references with versioned undo/replay/export semantics. Avoid baking the substrate into a displayed RGB pixel and alpha-compositing that substrate a second time.
4. Move bounded active tiles to a selected Worker/GPU owner with dirty-region transport and CPU-reference parity. A single 2048x2048x38 float32 spectral field is 608 MiB, excluding history and extra fields; full-frame spectral ping-pong buffers are not a safe default. Low-rank pigment bases or LUTs need measured approximation error budgets.
5. Treat fluid transport, evaporation, granulation, bristle mechanics and gloss/impasto as separate simulation problems. Kubelka–Munk supplies diffuse optics, not these dynamics. Never switch renderers silently within one stroke.

## Primary references

- Spectral.js source and single-constant assumptions: https://github.com/rvanwijnen/spectral.js and https://spectraljs.com/
- open-km's explicit fictitious-data warning: https://github.com/lwander/open-km
- Finite-layer KM/substrate model and experimental limitations: https://doi.org/10.1186/s41476-017-0068-2
- Measured-data evaluation candidate, not downloaded or integrated here: https://github.com/rubenwiersma/painting_tools and https://doi.org/10.17605/OSF.IO/PGN28 . Retain the authors' capture/opacity limitations and data license. A dataset citation is not evidence of product calibration.
- ColorMix implementation audited from installed `colormix@3.2.0` distribution (`src/ColorMixer.js`, `dist/index.mjs`); it averages Lab coordinates rather than implementing physical pigment scattering.

## Release boundary

This document records local review and measurements, not main merge, hosted CI or production deployment. Do not alter another session's release while publishing this branch. Keep required checks and branch protections intact; confirm exact remote branch/PR/main SHA before reporting release status.
