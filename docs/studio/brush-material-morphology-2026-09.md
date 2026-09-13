# Material morphology engine / 2026-09

## Scope and shipped behavior

This change adds **32 original coverage programs** to the existing pressure-aware dynamic brush
pipeline. The public quality portfolio grows from **48 to 80 tools (78 paint + 2 erasers)**; the
procedural implementation registry grows from 160 to 192. Registry entries are not advertised as
192 unique product brushes. Previously hidden aliases stay hidden.

The 32 programs are not a shared round tip with different size/opacity values. They explicitly
construct different spatial structures: branching channels, cellular walls, pigment clusters,
reticulated islands, charcoal pores, graphite platelets, felt cross-sections, split nibs, engraved
facets, silverpoint lines, fractured chalk, wax islands, woven linen, cracked gouache, etching dots,
curved bristles, opal facets, mica plates, diffraction rays, circuitry, isolines, light curtains,
coral polyps, fern fronds, ginkgo veins, maple lobes, layered rose petals, dandelion filaments,
herringbone, guilloche, fish scales and perforated sequins.

These are **material footprints**, not 32 new fluid simulators. Existing V6 material, wet-media,
oil/bristle, CanvasKit, p5.brush and GPU pathways remain intact. The new footprints use the existing
ink-particle/dry-media/airbrush planning, pressure, tilt, texture, coverage, replay and export
contracts. The separate existing `studio-material-brush-runtime.ts` is not replaced.

## Engine architecture

`studio-material-tip-kernels.ts` defines the original signed-distance, cellular and noise fields.
`studio-procedural-tip-rasterizer.ts` integrates coverage over each texel (16 samples for the new
materials, four for the original custom-motif compiler). Thin fibres and negative-space holes
survive better than centre-only sampling. Nonfinite coverage is transparent; size and work are
bounded. Its 1 MiB LRU returns detached arrays, so callers cannot corrupt future selections.

`scripts/generate-studio-material-tip-atlas.mts` compiles the new fields to a portable **64 x 64 R8**
atlas. The generated JSON is checked in and byte-for-byte verified against source. The runtime
loads it only through the existing lazy pack boundary. No field compilation, image request,
canvas readback or new rendering dependency is required on pointer-down. A stable identity hash,
not a catalogue ordinal, seeds each material. The complete tip bytes travel in the existing saved
stroke snapshot. This deliberately respects the current inline metadata budget; it is not a claim
of infinitely detailed textures when enlarged far beyond their native resolution.

Authored pressure curves independently affect width, pigment flow and coverage. Tilt broadens
selected dry marks and changes contact ratio; decorative tips can remain unsquashed. Continuous
nibs use dense station spacing; discrete stamps preserve recognisable negative space. Continuous
and discrete classifications are shared with continuity auditing. Palette randomness is not
needed to distinguish materials, and avoiding per-station color changes preserves tinted-atlas
reuse. Toolbar opacity remains the sole outer opacity control.

## Competitor reference matrix

Reviewed official documentation on 2026-09-13. These are feature references, **not measured
head-to-head benchmark results**. The comparison is representative, not every drawing product in
existence. Do not turn this table into an unsupported superiority or latency claim.

| Reference | Relevant documented behavior | Engineering acceptance criterion |
| --- | --- | --- |
| [Procreate](https://help.procreate.com/procreate/handbook/brushes/brush-studio) | Shape/grain, pressure/tilt curves, wet mix and stroke behavior | Material shape and grain must survive pressure changes; do not inflate count with parameter clones |
| [Clip Studio Paint](https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm) | Dual brushes, texture, watercolor edge, pressure/tilt/velocity controls | Shared live/replay contracts and controllable real input channels |
| [Krita](https://docs.krita.org/en/reference_manual/brushes/brush_engines.html) | Bristle, smudge, particle, hatching, pixel and other distinct engines | Keep real engine responsibilities separate; a morphology stamp is not a smudge simulator |
| [Adobe Fresco](https://helpx.adobe.com/ca/fresco/desktop/draw-paint-animate-and-share/live-brushes.html) | Physics-driven live watercolor and oil brushes | Preserve existing wet/oil programs; static pigment patterns are not proof of fluid simulation parity |
| [Rebelle](https://www.escapemotions.com/products/rebelle/about) | Watercolor diffusion, pigment mixing, impasto and bristle simulation | Evaluate natural-media interaction separately from shape diversity |
| [Photopea](https://www.photopea.com/learn/brush-tools) | Pattern/round tips, pressure controls, spacing, scatter, ABR | Portable tip snapshots, predictable pressure and useful distinct pattern brushes |
| [Magma](https://magma.com/features) | Browser drawing and configurable brush features | Keep interactive use and saved/collaborative replay consistent |
| [Kleki](https://kleki.com/help/) | Browser drawing tool workflow | Preserve straightforward selection, drawing and undo; test the product surface, not a separate demo |

No competitor brush images, proprietary presets, ABR bundles, assets or implementation code were
copied. A real competitive quality study still requires the same pen/tablet, screen scale, stroke
traces and canvas sizes, plus blinded artist evaluation. CI synthetic pointer channels cannot
certify Wacom/Apple Pencil device latency, WebGPU parity or subjective superiority.

## Free-operation and licensing decisions

The increment adds **zero runtime package dependencies and zero paid APIs/asset downloads**.
All new kernels and atlas data are original project code. Existing repository dependency versions
and their generated third-party notices remain unchanged.

- [p5.brush](https://github.com/acamposuribe/p5.brush) is MIT and already present in the project;
  its existing dedicated runtime is preserved rather than inserted as a second copy on every stroke.
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) is an existing pressure-outline
  dependency. Outline geometry does not replace pigment/substrate texture.
- [libmypaint](https://github.com/mypaint/libmypaint) is **ISC**, distinct from the MyPaint application's
  license. It is a viable native/WASM engine candidate, but **this change does not integrate it**.
  Its adapter, binary build, dependency notices and CPU/GPU parity need their own validation.
- Existing Paper.js, Rough.js, Pixi/CanvasKit and input stabilization paths were not duplicated just
  to increase a library count. A free service still needs license compliance; free-of-charge
  software is not automatically a redistributable browser SDK.

## Reproduction and gates

```sh
pnpm exec tsx scripts/generate-studio-material-tip-atlas.mts
git diff --exit-code -- apps/web/src/domains/creator/brush/studio-material-tip-atlas.generated.json
pnpm exec vitest run \
  apps/web/src/domains/creator/brush/studio-procedural-tip-rasterizer.test.ts \
  apps/web/src/domains/creator/brush/studio-material-tip-kernels.test.ts \
  apps/web/src/domains/creator/brush/studio-material-morphology-runtime.test.ts
pnpm exec playwright install chromium
node scripts/verify-studio-material-morphology.mjs
```

The added browser gate uses the **actual product selection, render planner and coverage compositor**.
It checks all 32 tips, live/retained/JSON replay pixel equality, light/heavy pressure, tilt and DPR
1/2/3. It retains contact sheets and a JSON report. Planner and Canvas submission timings are
reported separately from diagnostic pixel readback. The 33 ms planner and 50 ms submission P95
limits are CI freeze guards, not 120 Hz or physical-pen latency claims.

The unit gates cover byte parity, finite coverage, cache mutation/eviction, opacity-neutral spatial
pairwise differences, unknown ids, public picker exposure and persisted replay. Pairwise coverage
uses equal alpha mass and a total-variation floor of 0.18, so a mere opacity difference cannot pass.
Existing catalogue, material/V6 persistence, continuity, UI, type, lint and build checks remain in
force. Main protection is not relaxed.

## Full-stroke anti-clone regression

Different tip fields can still converge when dense deposits overlap. The browser gate therefore
also compares all **496 pairs of actual retained strokes** with the same color, width and pressure
trace, normalizing each alpha image to equal total mass. Every pair must exceed 0.10 total
variation. This is independent of the 0.18 tip-field gate, and does not count opacity as novelty.
The audit exposed a chalk/gouache convergence; the gouache construction was replaced with a
separate lamellar film-fracture program, rather than changing only opacity, size or random seed.
These trace-specific numerical guards still do not replace artist testing or physical paint
simulation. The exact minimum and closest pair are retained in the browser report.
