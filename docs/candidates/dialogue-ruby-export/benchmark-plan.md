# Dialogue ruby export benchmark plan

## Completed automated evidence

Measured on 2026-08-09 in the shared Vite/Vitest workspace:

```text
pnpm exec vitest run \
  src/domains/creator/studio-dialogue-ruby-export.test.ts \
  src/domains/creator/studio-canvaskit-pdf-vector.test.ts \
  src/domains/creator/studio-psd-export-text.test.ts

3 files, 66 tests passed, 0 failed, 0 skipped
wall duration reported by Vitest: 0.763s
```

The expanded PDF conformance/font/profile regression run passed **7 files / 165 tests** in **0.875s**
with zero failures or skips.

An in-process 300-iteration vertical-rl fixture (`縦2026横天地玄黄`, two ruby spans including
tate-chu-yoko and a cross-column reading) measured:

| Stage | p50 | p95 | p99 |
|---|---:|---:|---:|
| Shared product-plan -> PDF ops | 0.021ms | 0.046ms | 0.095ms |
| PDF object/font/ToUnicode assembly | 0.051ms | 0.082ms | 0.189ms |

The deterministic result was 3,688 bytes, SHA-256
`1dde8196bfa361f9ab0be2a114a9257efad160c7aa57f5cebd901320016603e0`. Peak memory was not
exposed by this runner and is recorded as `null`, not zero.

A 50-iteration product `exportPagePsd` run used one 120x160 RGBA layer with vertical ruby and
tate-chu-yoko. It measured **3.154/4.086/4.563ms p50/p95/p99**, including planner, XMP, layer channel
encoding and ag-psd assembly. The 48,724-byte output was byte-deterministic with SHA-256
`d6a1ea67a7edd4e06dfbf625d7134ff8b72270d4b645ef5ffbf9bd8f15ab0e46`; peak memory was unavailable
and is `null`. This synthetic timing isolates export overhead; visual parity remains gated by the
real Konva/Photoshop corpus below.

The deterministic corpus covers:

- horizontal Unicode base/ruby PDF operations;
- CID `/ToUnicode` and marked `/ActualText` bytes;
- vertical-rl base and right-side upright ruby;
- tate-chu-yoko next to/under a ruby span;
- cross-column vertical spans with all reading glyphs retained;
- fractional/out-of-range/overlap/surrogate-splitting receipts;
- plain text unchanged;
- PSD visible raster capture invocation and layer bounds;
- PSD XMP byte semantics and ag-psd read-back of exact source spans;
- deterministic repeated plans and canonical XMP ordering.

Root TypeScript (`tsc -p tsconfig.json --noEmit`) also passed after implementation.

## Release benchmark matrix

| Gate | Corpus | Metric | Pass condition |
|---|---|---|---|
| PDF visual parity | Horizontal ruby, vertical-rl ruby, 1/2/4-digit tate-chu-yoko, rotated Latin, 2/4-column splits | Rasterized PDF vs product reference fuzzy mismatch | <=0.5% outside explicitly documented font-hinting delta |
| PDF semantics | Same corpus with CJK/emoji/custom fonts | Extracted Unicode and font resource inspection | Exact base+reading Unicode; no `?` substitution; embedded-font license gate passes |
| PSD visual parity | Same corpus opened in Photoshop and Photopea | Export raster vs application composite | <=0.5% fuzzy mismatch; ruby visible before and after save |
| PSD metadata | Export -> ag-psd/Photoshop save -> read | XMP manifest digest | Exact text, writing mode, offsets and readings |
| PSD truthfulness | Native-layer inspection | False editable-ruby claims | Zero; raster/XMP receipt present for every ruby element |
| Robustness | Invalid offsets, overlap, surrogate split, cross-column split | Silent losses | Zero; every rejection appears in receipt and raw source stays in XMP |
| Latency | 1, 100, 1,000 annotated elements | p50/p95/p99 and peak memory | p95 <= existing export +10%; metadata overhead <=2MiB policy budget |
| Determinism | 100 repeated exports | SHA-256 | One digest per fixed input/runtime version |

## Raw-data format

Future browser/Photoshop runs write JSON with runtime versions, font file SHA-256, fixture ID, page
dimensions, annotation count, p50/p95/p99, peak JS/WASM memory when exposed, output SHA-256, visual
diff, extracted text, XMP digest and all warnings/unsupported entries. Unavailable memory APIs must be
recorded as `null`, never zero.

## Remaining external gates

- Photoshop native open/save round-trip on macOS and Windows.
- Photopea interoperability.
- Actual licensed CJK font corpus, including TTC and variable fonts.
- Independent PDF rasterizer and text extractor comparison.
- Physical CSP reference export and human review of ruby spacing/reading comfort.
