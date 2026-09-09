# Studio Pixel Pencil Pro benchmark and implementation note

Date: 2026-09-09

## Benchmark signals

- **Aseprite** exposes integer brush size, a Pixel-perfect switch, multiple brush-tip families,
  symmetry axes, and tiled editing. The important interaction lesson is that pixel intent is visible
  in the primary context bar rather than hidden behind a generic brush engine.
- **Krita** combines pixel-grid alignment and hard/sharp tips with mirror, multibrush, and wrap-around
  workflows. The reusable lesson is to share symmetry/document transforms while keeping pixel input
  free from stabilizer and pressure dynamics.
- **Piskel** keeps sprite preview/export close to editing. Animation preview is valuable, but belongs
  to the frame/timeline product boundary rather than the pixel-pencil stroke contract.
- **Lospec** makes palette and dithering constraints explicit. Palette lock and dither matrices should
  be implemented as document/color policies, not as hidden mutations inside one pen.

## Implemented in this change

1. Integer hard tips from 1px through 64px, persisted per new stroke.
2. Aseprite-style pixel-perfect cleanup for 1px A→B→C cardinal corners.
3. User-selected vertical, horizontal, radial, kaleidoscope, and silk symmetry persisted on pixel
   strokes through the existing renderer-neutral transform contract.
4. Strict width normalization and coordinate expansion validation before any stamp loop starts.
5. Existing `pixel-grid-v1` replay remains untouched: cleanup happens only while recording new input.
6. Direct live-preview ownership safely falls back to a replaceable draft for the rare corrected corner.

## Deliberately staged follow-ups

- Palette lock, indexed-color conversion, and reusable project palettes.
- Ordered/Bayer and pattern dithering with foreground/background color pairs.
- Seamless tile/wrap-around preview and sprite animation playback.
- Custom bitmap tips and tip rotation.

These need explicit document and color-model migrations. Shipping them as pen-local flags would create
export/replay inconsistencies, so this MR establishes the safe stroke/input foundation first.
