# Smart Filter / Filter Gallery parity

## Goal

The Filter Gallery already exposed 77 local deterministic filters, while the non-destructive Smart
Filter stack admitted only 60. The missing 17 effects were the shared union-wave family: geometry,
procedural material, print, normal-map, and volumetric-light effects.

This change closes that product gap without adding parallel pixel engines. Each new Smart Filter
entry projects into the existing `filterUnionWave` runtime, preserving the same bounded CPU/Worker
implementation, alpha policy, deterministic seeds, and saved-document representation used by the
Filter Gallery.

## Newly non-destructive

- Geometry: sine wave, radial ripple, fisheye, twirl, pinch/bloat, lens distortion, polar coordinates
- Material/noise: cinematic film grain, salt-and-pepper noise, RGB noise, fractal value texture
- Stylize/print: pointillism, stained glass, poster edges, high-contrast photocopy, normal map
- Light: volumetric rays

## Editing contract

Every effect now has meaningful bounded controls in the Smart Filter panel. Geometry effects expose
reversible signed strength, normalized centers, and bilinear/nearest interpolation. Polar conversion
also exposes both coordinate directions. Procedural filters retain deterministic seed controls.

Existing stacks and document version remain unchanged. Unknown engines still fail closed; operation
order and duplicate-engine isolation remain intact.

## Verification

Focused tests cover all 17 engine IDs, default projection, parameter clamping, polar mode,
interpolation, deterministic controls, and the 77-item Smart Filter catalog count. Repository `core`
remains the merge gate. The published pull-request diff contains only product source, tests, and this
receipt; no temporary workflow, payload, or patch script remains.
