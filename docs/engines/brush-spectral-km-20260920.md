# Brush pigment engines and Kubelka–Munk review — 2026-09-20

## Scope and compatibility

This change adds real pigment models to the V6 material/contact brush path, not new canvas renderers. CanvasKit, Vello and libmypaint retain their own render/surface responsibilities. Existing saved `pigment-spectral` and `pigment-open-km` receipts remain on their original WGM implementations; no historical stroke is silently recolored.

| New node | Implementation | Meaning |
| --- | --- | --- |
| `pigment-spectral-js` | `spectral.js@3.0.0`, MIT | Reconstructed 38-band spectrum, single-constant K/S and luminance/tint-adjusted effective concentration |
| `pigment-open-km-spectral` | Audited open-km scalar port + Spectral.js spectrum/color conversion, MIT | Separately mixed K and S; currently reconstructed spectra with assumed S=1, not measured paint data |
| `pigment-colormix-lab` | `colormix@3.2.0`, MIT | CIE Lab interpolation, deliberately not presented as physical pigment mixing |

The npm releases are exact-pinned in the lockfile. ColorMix's published root entry points reference missing files, so the integration imports its self-contained `dist/index.mjs`, never the DOM gradient API. Its historical Babel/core-js dependencies are declared by npm metadata; they are not intentionally imported by this adapter. Dependency review and normal bundle gates remain mandatory.

open-km is a browser demo, not an installable npm brush package. We preserve commit `24222a131c94cdaf8cbbe76c0c228d44a536c99a`, its complete MIT license and original `km.js` beside the adapted scalar kernels. We do not import its auto-running DOM/WebGL demo, fictitious sample spectra, fixed Saunderson coefficients, or approximate gamma 2.2. Original km.js SHA-256: `081ad215db745e22e52b1f70d4e786807b95d8e9d554ecd25f19f522b619e362`.

## Product connection

The real material palette provider, runtime manifest, node registry and topology compatibility list all recognize the new versioned providers. The existing bounded material palette cache computes 33 entries per color pair/provider and reuses them; no spectral solver runs per dab. Product brushes persist exact provider versions through the existing no-fallback v2 material receipt.

The material tab includes real comparison ramps and explicit selection buttons. Selection follows the existing authoring history and product-save path. Merely viewing a comparison does not mutate a brush. The finite-layer probe is local UI state: its thickness and substrate are NOT committed into brush programs and it does not read underlying canvas pixels.

## Optical model

For opaque diffuse paint, q=K/S, F(R)=(1-R)^2/(2R), and R-infinity=1/(1+q+sqrt(q)*sqrt(q+2)). The rationalized inverse avoids subtractive cancellation. Mixtures combine K and S separately by normalized concentrations. Averaging RGB, Lab, or K/S when S differs is not equivalent.

For a homogeneous finite layer, the new kernel calculates reflectance R and transmittance T, then composes a substrate B as R + T^2*B/(1-R*B). Coverage/alpha compositing is not this optical operation. The implementation handles zero thickness, zero absorption, zero scattering, thin-layer limits and optically thick layers without sinh/cosh overflow. It rejects non-finite, negative and unsupported inputs instead of concealing numerical errors.

Spectral.js's reconstructed white peaks near 1.00116 reflectance. The unmodified Spectral.js provider retains upstream behavior; synthetic inputs to the separate physical-layer/open-km adapter are explicitly bounded to passive reflectance before deriving K/S. This is an authoring approximation, not a new measured calibration.

## Evidence and repeatable measurements

Run `node scripts/benchmark-brush-pigments.mjs .qa/pigment/browser`. It starts an isolated local Vite fixture with the actual workbench/provider modules, tests three explicit selections and local JSON restore, exercises the optical probe, and measures five fixed color pairs. Ten warm-up passes precede 31 rotating-order measurements; a second full run checks palette hashes. It always closes its browser/server. No production endpoint, authenticated account or database is used.

Measured on Apple M2 Max, 32 GiB, Chrome 153.0.8010.48. First run medians (warm JavaScript):

| Provider | 33-color palette, ms | Palette p95, ms | Cached lookup, µs | 1024 input samples -> contacts, ms |
| --- | ---: | ---: | ---: | ---: |
| Existing WGM | 0.06 | 0.06 | 0.18 | 2.0 |
| Mixbox 2 | 0.02 | 0.04 | 0.16 | 2.0 |
| Spectral.js 3 | 0.04 | 0.06 | 0.16 | 2.0 |
| open-km spectral adapter | 0.10 | 0.12 | 0.16 | 2.0 |
| ColorMix Lab | 0.04 | 0.06 | 0.16 | 2.0 |

Palette numbers average five palettes; cache numbers average 5000 lookups per measurement. Browser clock quantization and single-device sequential execution limit precision. Contact timing excludes palette construction, raster drawing, event dispatch and presentation. These are NOT FPS, input-to-photon latency, cold startup, or scientifically calibrated pigment-accuracy scores. Different model outputs intentionally have different hashes.

For #002185 + #fcd200 at 50%, outputs were WGM #2d7c13, Mixbox #298139, Spectral.js #3d933e, open-km #00414f and ColorMix #9f7265. The difference between the two K/M-based providers demonstrates concentration/upsampling assumptions; it is not evidence that either reproduces a measured mixture better.

The unit suite covers an independent coth reference, pure absorber/scatterer limits, empty and optically thick layers, layer-stacking equivalence, 1024 deterministic logarithmic passivity cases, upstream library calls, cache reuse, provider receipts and replayed contact colors. The existing legacy-replay tests remain unchanged. Browser evidence covers real workbench selection and restore, not full Studio editing, SQL/OPFS durability, physical pens or production deployment.

## Limits and high-value next steps

1. **Measured pigment assets first.** RGB does not uniquely determine a spectrum, and reflectance alone does not identify separate K and S or an absolute thickness scale. Introduce immutable pigment assets containing wavelength grid, K, S, units, illuminant/observer, binder/substrate conditions, provenance/license and calibration uncertainty. Keep reconstructed assets visibly labeled synthetic. Cross-validate on held-out mixtures, not on the samples used for fitting.
2. **Versioned deposition state.** Store per-pigment concentration, layer thickness, water/binder content and coverage independently. Preserve random seeds, substrate references and the physical model version in stroke/undo receipts. A physical glaze must read/compose the spectral substrate once; baking the substrate into RGB and alpha-compositing it again would double-count it.
3. **Bounded tile execution.** Keep concentration fields and optical calculations in a selected Worker/GPU owner with dirty-region updates. A single 2048² × 38-band float32 plane is 608 MiB before layers, history or ping-pong buffers; allocating several such planes per canvas is not a practical default. Use bounded active tiles, measured pigment bases and explicitly error-tested palette/LUT approximations instead.
4. **Quality and parity gates.** Compare CPU reference and WGSL/WebGL outputs by spectral error and perceptual color difference; preserve alpha/coverage, old strokes, undo/reopen and exports. Benchmark low-end devices and long strokes, including thermal/memory behavior and context loss, before changing a default engine. No automatic renderer fallback within a stroke.
5. **Broader physical effects are separate.** KM models diffuse optical absorption/scattering. Water transport, evaporation, capillary backruns, pigment sedimentation, bristle mechanics, paper texture, gloss and impasto need additional state/models. Combining libraries alone does not provide these phenomena.

## Primary references and calibration candidate

- Spectral.js source/API and explicit single-constant assumptions: https://github.com/rvanwijnen/spectral.js and https://spectraljs.com/
- open-km original shader and fictitious-spectra warning: https://github.com/lwander/open-km
- ColorMix: installed `colormix@3.2.0` source `src/ColorMixer.js` and exact ESM build `dist/index.mjs`; `mix()` computes a weighted Lab average. The lockfile records the registry artifact integrity.
- Finite-layer K/M and substrate equation, including limitations and independently calibrated samples: https://doi.org/10.1186/s41476-017-0068-2
- Measured-data candidate, not imported in this change: https://github.com/rubenwiersma/painting_tools and https://osf.io/pgn28/ . The authors share ten historical oil pigments and reconstruction scans; code is MIT and dataset CC-BY-NC-SA 4.0. Their own opacity and capture caveats must be retained. These are candidates for validation, not automatically accurate production presets.

## Release boundary

Branch `feat/brush-spectral-km-20260920` initially used release-quality change `5dd7d97377a2db612a390fcd8f99c93fa8eb4872` (PR #1845), then was cleanly rebased onto main `d228a24fa9addd38d7f7701ed715ed8d6824f71e` after that release fix and the independent 3D changes merged. Other branches/worktrees were not modified. Do not confuse this feature's local tests or isolated browser fixture with a main merge, passing hosted CI, or a deployed production version. Main/production state must be checked separately. No authentication, production infrastructure, migrations, budget baselines, or historical stroke identities are modified by the pigment feature.

Seven explicit regression targets (four new pigment suites plus legacy replay/provider/cache checks) were added to the required CI manifest without dropping targets or weakening thresholds. The local V6 suite passes 445 tests across 26 files, including 34 new pigment tests; the 1024 randomized-domain passivity cases are inside one test and are not counted as 1024 independent tests.
