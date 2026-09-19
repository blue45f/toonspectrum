# Native brush benchmark and lossless output optimization — 2026-09-19

Status: **implemented and measured on the current selected-stroke conversion workflow**.
This does not promote any engine to main-canvas live pointer authority.

## Benchmark intent and external design references

Krita's Instant Preview separates low-resolution feedback from final full-resolution work, and
its manual explicitly documents brush settings that can cause a completion-time pop. That is a
useful warning, not permission to silently lower this editor's output resolution. This change
keeps every output pixel, canvas dimension, pressure sample, source snapshot and history
contract unchanged. Reference: https://docs.krita.org/en/reference_manual/instant_preview.html

Skia documents CanvasKit as a hardware-accelerated SkSurface/Canvas interface; that does not
mean module initialization, interop and PNG encoding are free. Initialization and render-to-PNG
are measured separately here. Reference: https://skia.org/docs/user/modules/canvaskit/

Timings use browser performance.now() durations within one realm, rather than subtracting
unrelated Worker/window time origins. Browser timing quantization is retained in raw reports.
Reference: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now

No direct Krita/CSP/Procreate speed or quality comparison was executed. Existing document
conversion engines are compared on the same recorded input; libmypaint has different brush
dynamics, so its pixel difference from vector renderers is not interpreted as a quality score.

## Measured bottleneck and implementation

The native Worker imported the entire studio-brush-platform barrel to start one libmypaint
session. Its helper imported raster-compile, which in turn imported vector compilation,
project-model schemas and unrelated providers. A focused `./libmypaint` package entry now
loads the same native session without those value-import dependencies. The deterministic
sample helper was moved unchanged to raster-stroke-samples.ts and remains re-exported from
raster-compile for existing callers. A TypeScript-AST boundary test verifies that this entry's
value graph is only libmypaint.ts and raster-stroke-samples.ts.

The final output path previously expanded a native packed region into the full canvas, read the
entire canvas back and examined every pixel. It now validates native RGBA directly before canvas
allocation, checks only actual crop-edge contacts, and stops visibility scanning at the first
nonzero alpha. Bitmap providers retain one necessary settled read, but use the same bounded
edge/visibility algorithm. Alpha=1 is still visible; no threshold or lower resolution is introduced.

This removes the extra Canvas2D getImageData call for native document output. It is NOT a claim
of zero driver/internal PNG-encoder readback, zero-copy output, or measured total heap reduction.
CanvasKit/Vello still perform one explicit settled pixel read. Output encoding, surface size,
color, compression and canonical PNG placement remain unchanged.

## Measured results

Environment: Chrome 153.0.8010.48, Apple M2 Max, 32 GiB, macOS Darwin 25.6.0.
Three workloads × three engines × 20 measured repetitions, after three warmup rounds.
A fresh Worker is created and terminated for every conversion; browser HTTP/WASM caches are
shared. Provider order rotates each round. The candidate was measured twice. Total across
baseline and both candidate runs: 621 conversions including warmups (540 measured samples).
Other machine activity was not suppressed; start/end load averages are recorded.

All times below are milliseconds from product conversion invocation through returned, validated
PNG data URL. They include Worker initialization, native rendering, encoding and client digest
validation, but exclude the later image decode and diagnostic pixel hashing. p95 uses nearest
rank over 20 samples. The small sequential-run design is not a statistical significance test.

| Workload | Engine | Before p50 | After p50 | Reduction | Before p95 | After p95 | Repeat p50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| short-64-12px | libmypaint | 34.1 | 17.7 | 48.1% | 35.2 | 18.8 | 17.4 |
| short-64-12px | canvaskit | 94.8 | 91.8 | 3.2% | 96.4 | 95.3 | 91.8 |
| short-64-12px | vello | 96.4 | 89.9 | 6.7% | 97.1 | 93.1 | 90.9 |
| long-1024-48px | libmypaint | 46.6 | 26.1 | 44.0% | 48.1 | 27.0 | 26.1 |
| long-1024-48px | canvaskit | 99.2 | 94.5 | 4.7% | 101.8 | 96.4 | 95.3 |
| long-1024-48px | vello | 104.6 | 97.6 | 6.7% | 106.6 | 99.8 | 99.3 |
| dense-4096-128px | libmypaint | 61.2 | 36.4 | 40.5% | 63.3 | 38.7 | 35.9 |
| dense-4096-128px | canvaskit | 111.3 | 106.1 | 4.7% | 113.5 | 113.8 | 105.7 |
| dense-4096-128px | vello | 120.0 | 112.8 | 6.0% | 124.3 | 117.3 | 111.9 |

The primary result is the 40–48% reduction in libmypaint total median conversion time, with
consistent repeat-run results. The CanvasKit/Vello median differences are modest and may
include run-to-run variance. **Do not claim every tail improved:** CanvasKit's dense-workload
p95 was 113.5→113.8ms on the first candidate run (107.5ms in the repeat).

All nine engine/workload pairs had identical decoded RGBA SHA-256 before and after, in every
measured repetition and both candidate runs. Output dimensions and PNG byte lengths were
unchanged. This is within-engine before/after identity, not equality between different engines.
CanvasKit/Vello additionally compare their common outline to a Canvas2D reference; minimum
coverage intersection-over-union was 0.9883237 at alpha>16. This is a structural diagnostic,
not an artist preference test or a claim of identical antialiasing across renderers.

## Validation

- Scoped engine/geometry/document/inspector/export suite: **802 passed, 3 existing optional
  Google Ink tests skipped**, 48 passing files and one entirely skipped file.
- Twenty new output/lifecycle tests include 512 seeded comparisons to the former full-canvas
  alpha algorithm. Two focused-import tests protect sample identity and dependency boundaries.
- Brush-platform, Skia, benchmark-harness and frontend TypeScript checks passed.
- Full production build passed, with static CSP verification and third-party notice generation.
- Actual compiled Worker passed document conversion for all three engines, source preservation,
  fixture-history Undo/Redo, canonical document-codec reload and SVG PNG embedding.
- The original native trial workflow passed, including its deterministic wash packed-dirty
  reconstruction (zero mismatched bytes). Final Worker count 0 and peak 1; page/CSP errors 0.
- Faster completion exposed a race in the old Playwright cancel-button click. The verifier now
  deliberately holds a real completed Worker reply before client delivery, then uses the actual
  cancel UI. It does not delay the engine, skip cancellation, or fake a successful result.

Existing large-chunk, wasm-vips and Three/VRM build warnings are not addressed by this change.
The browser workflow harness uses the actual inspector and production planner/codec with an
isolated history host; it is not whole-Studio E2E, OPFS crash recovery or physical-stylus validation.

## Reproduction and raw evidence

```sh
pnpm run build
node scripts/benchmark-studio-native-brush-document.mjs --built-worker --label=optimized --trials=20
node scripts/benchmark-studio-native-brush-document.mjs --built-worker --label=optimized-repeat --trials=20
node scripts/compare-studio-native-brush-benchmarks.mjs baseline optimized
node scripts/compare-studio-native-brush-benchmarks.mjs baseline optimized-repeat
node scripts/verify-studio-native-brush-document.mjs --built-worker
node scripts/verify-studio-native-brush-probe.mjs --built-worker
```

To regenerate the before run, build parent 9ef40f1a2589df856d59ec954db5526130cd5c70 in
an isolated worktree and copy only the benchmark runner there, not the optimized runtime.
Run it with --label=baseline, then compare the reports in one .qa/engine-resume directory.
The original before artifact was studio-native-brush-probe.worker-gznltLBc.js and the
candidate artifact was studio-native-brush-probe.worker-CvjdnVUh.js. Reports captured the
parent Git HEAD plus dirtySource=true because the runner/patch were not committed at timing.
They do not falsely label these measurements as an already-committed release artifact.

Raw reports, per-trial timings, input/pixel hashes and real-output contact-sheet screenshots are
kept locally in ignored `.qa/engine-resume/`, not committed as generated source. Report SHA-256:

- `native-brush-benchmark-baseline.json`: `3576b9dcf06dde81898ee9427364ea16289b3b359ca8ade84f7fb4a59be4e3cc`
- `native-brush-benchmark-optimized.json`: `31508ab8062f69eb671767dd8ea7c5c4f61543eabea71fce4dfbfd09bc18288a`
- `native-brush-benchmark-optimized-repeat.json`: `8d38949c4a6df0474d9c704496ff5be7e66dabb43b4e2a70f79e1a1300715a8e`

## Next evidence-based priorities

The remaining largest costs are fresh native initialization and GPU-render-to-PNG completion.
Any reuse must remain scoped to an explicitly selected provider and bounded lifecycle, not a
silent fallback or an always-on Worker pool. A live renderer change additionally needs input-to-
presentation measurements, exact live/commit matching and physical pen/mobile acceptance.
No new engine dependency, license-policy change, automatic fallback or deployment was added.
