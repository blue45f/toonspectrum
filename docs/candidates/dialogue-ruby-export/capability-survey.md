# Dialogue ruby export capability survey

## Outcome

PDF uses the repository's CID TrueType vector writer with positioned Unicode base/ruby glyphs,
`/ActualText`, and a generated `/ToUnicode` CMap. PSD keeps the authoritative Konva appearance as a
visible raster layer and stores the exact source text, writing mode, and UTF-16 `rubySpans` in a
deterministic document XMP packet. PSD ruby is reported as metadata-only editability; it is never
labelled as native editable ruby.

## Candidates

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ToonSpectrum vector PDF writer + CID positioned overlays | Existing paths, clipping, CMYK, embedded sfnt fonts, exact coordinates; now emits Unicode `/ActualText` and `/ToUnicode` | PDF has no native editable `vertical-rl + ruby` object; font ascent is a bounded placement approximation | Base and ruby remain vector text at any zoom; product planners own placement | Plan 0.021/0.046/0.095ms; PDF build 0.051/0.082/0.189ms (p50/p95/p99, 300 iterations) | Not exposed (`null`) | No new bundle or dependency | Byte-deterministic; measured 3,688B SHA-256 `1dde8196…6603e0` | Repository-local code; no additional third-party license | Low: consumes `StudioPdfOp` | Medium: direct PDF object writer | **Selected PDF path** |
| CanvasKit/SkPDF | Skia-quality shaping and native PDF backend in C++ distributions | Installed browser `canvaskit-wasm@0.41.1` types/bundle expose no `MakePDF`/SkPDF document surface | Potentially strongest shaped-text appearance | Not measurable: API unavailable in deployed bundle | Not measurable | Existing CanvasKit WASM is already large; a custom SkPDF build would add build/deploy cost | Depends on Skia build/version | BSD-3-Clause | High: custom CanvasKit build and font plumbing | High | Quarantined challenger; reopen when browser artifact exposes and passes SkPDF gates |
| Existing JPEG-page PDF writer | Captures the exact composited page, including ruby, effects, and custom fonts | No editable/searchable text, no ruby/source metadata, raster scaling only | Exact at export resolution; degrades on zoom | Existing production path; not rebenchmarked in this slice | Full page JPEG/canvas | No new bundle | Deterministic for deterministic JPEG input | Repository-local code | Very low | Low | Appearance-only PDF fallback |
| ag-psd native `Layer.text` (`orientation`, `styleRuns`, `baselineShift`) | Photoshop-editable horizontal/vertical base text; ag-psd 31.x writes EngineData | No ruby relationship/range semantic; synthesizing inline readings changes text order and does not round-trip as ruby | Native base text can reflow; fabricated ruby would not match product geometry | Focused PSD tests included in 66-test run | Existing layer canvas plus text descriptor | Existing dependency only | Deterministic for bounded descriptor inputs | MIT | Low | Medium | Plain text only; explicitly not used to fake ruby |
| ag-psd visible raster layer + deterministic XMP manifest | Exact current appearance stays visible; original text/ranges survive without private PSD mutation | Ruby is not natively editable in Photoshop | Exact Konva capture, including vertical ruby and tate-chu-yoko | 3.154/4.086/4.563ms (p50/p95/p99, 50 one-layer exports) | Not exposed (`null`) | Existing dependency only | Canonical XMP; measured 48,724B SHA-256 `d6a1ea67…ab0e46` | MIT | Low | Low | **Selected PSD ruby path** |
| Custom Photoshop EngineData/descriptor injection | Could theoretically encode undocumented Japanese text-engine state | ag-psd has no public ruby model; private keys are undocumented/version-coupled and can corrupt type layers | Unverifiable without Photoshop-version corpus | Not run: rejected before implementation | Unknown | No bundle increase but large reverse-engineering cost | Low | Repository code over Adobe-private format semantics | Very high | Critical | Rejected; never claim native ruby without independent Photoshop round-trip evidence |

## Capability evidence inspected

- `ag-psd@31.0.1` exposes `LayerTextData.orientation`, `styleRuns`, `baselineShift`, horizontal and
  vertical scale, but no ruby/furigana field. It exposes document `imageResources.xmpMetadata`.
- `canvaskit-wasm@0.41.1` is BSD-3-Clause. Its installed TypeScript declarations expose paragraph,
  glyph and canvas drawing APIs but no PDF document/surface constructor.
- The existing PDF writer embeds TrueType sfnt bytes and Identity-H glyph IDs. This slice adds the
  missing Unicode extraction map and marked-content text replacement.
- The existing PSD exporter always retains an element's raster preview. This slice makes that
  fallback explicit and supplements it with a machine-readable XMP receipt.
