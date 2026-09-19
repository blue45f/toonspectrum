# Native brush document conversion — 2026-09-19

Status: **current: explicit selected-stroke conversion connected to normal document commit**.
This continues the merged Vello, CanvasKit, libmypaint-session and native-trial work (#1830,
#1832, #1834, #1835). It does not replace the live pointer renderer or change saved brush presets.

## Artist workflow

Select an unlocked, visible freehand stroke. In the drawing-tool or selected-freehand inspector,
open **선택 획 · 네이티브 엔진 변환**, choose **문서 변환 엔진**, then press **선택 획 변환**.
The libmypaint lane exposes ink, wash and chalk; CanvasKit and Vello consume the same
pressure-generated vector outline. No engine is initialized before this explicit action.

The command intentionally reinterprets the stored centerline/sensors through the selected engine.
It does not promise to copy the previous brush's artistic texture. The result is a PNG image above
the original stroke. The original's data and name remain untouched; only its visibility changes.
The image inherits the source opacity once, group, layer role/color and explicit no-clip setting.
Ordinary image/document history, canonical serialization and SVG embedding handle the result.

## Source and rendering contract

Source coordinates are translated into a bounded crop with one document pixel per output pixel.
There is no implicit resize to the old 512×256 trial resolution. The crop limit is 2048×2048,
brush diameter is 1–128 pixels, and at most 8192 stored samples are accepted. Oversized work is
rejected rather than downsampled. A conservative halo is verified again against the actual final
alpha field: unintended crop-edge contact aborts conversion, while true document-edge clipping
is declared explicitly. A blank output also aborts without hiding the original.

Recorded pressure, tilt and time channels must be finite, aligned and in range. Timestamps must
be nondecreasing. Legacy strokes without pressure use 0.5; missing timestamps use 8ms per sample.
The inspector displays these assumptions before conversion. Mask, clip-below, alpha-lock,
non-source-over blend, symmetry, gradient/pattern/fill and sketch variants are not admitted.
A changed containing-panel identity after cropping is rejected at the commit boundary.

The existing Dedicated Worker protocol now accepts a bounded surface and a settled document
render command. All native input runs inside that selected Worker. libmypaint returns its packed
dirty region without per-batch full-frame reads. Final PNG encoding and alpha/crop validation
perform a single explicit settled-output read; this is not advertised as a zero-readback live path.
The worker returns PNG bytes with SHA-256. The product client checks PNG header/dimensions,
input count, selected engine and the digest before producing a durable data URL. Transferable
bitmaps and temporary canvases are released on success and failure; cancellation terminates the
Worker. It never starts another engine to approximate the failed provider.

## Document authority

The editor captures a mutation ticket before asynchronous work begins. The commit closure reads
current page/history refs, checks access and review locks, rejects in-progress save/drawing/stroke
commits, and preserves the captured history identity/index, page and document dimensions. It
also compares the complete source snapshot and inherited locks again. An undo, other edit,
page/project switch or source mutation invalidates the result. The closure is single-use and calls
the existing commit once. UI notification errors cannot invalidate an already accepted commit.
Master-page conversion remains disabled rather than guessing its page/group semantics.

## Verification and reproduction

- Focused engine, geometry, inspector, source-boundary, document-codec and SVG regression suite:
  **780 tests passed; 3 pre-existing optional Google Ink checks skipped** (46 passed files and
  one entirely skipped file). These skips are not counted as successes.
- New conversion tests: 34 source/transaction/PNG tests, 11 inspector tests and 3 product-wiring
  checks. Source/page/lock changes, cancellation/unmount, stale history, duplicate commits and
  malformed results are covered.
- Frontend, brush-platform, Skia-package and benchmark-harness TypeScript checks passed.
- Changed-source strict ESLint passed. The existing large-host Babel size note is not a new error.
- Real Chrome 153.0.8010.48 with Dedicated Workers passed the new inspector flow for all three
  engines: visible PNG, preserved original, exact fixture-history Undo/Redo, production canonical
  document codec reload, and one embedded PNG in SVG. Stale-history and cancellation paths kept
  the source untouched. Worker peak was 1; remaining Workers were 0. Page/CSP errors were 0.
- Production `pnpm run build` passed, including generated third-party notices and static CSP checks.
  The compiled Worker artifact also passed both document and trial browser verifiers under the
  strict CSP, without JavaScript unsafe-eval. Existing large-chunk, wasm-vips eval and Three/VRM
  compatibility warnings remain visible in the build log; they were not suppressed or reclassified.
- The previous 512×256 trial browser regression also passed for all three engines. Its deterministic
  wash dirty-frame reconstruction retained 0 mismatched bytes and the prior transfer measurement.

```sh
node scripts/verify-studio-native-brush-document.mjs
node scripts/verify-studio-native-brush-probe.mjs
pnpm run build
node scripts/verify-studio-native-brush-document.mjs --built-worker
node scripts/verify-studio-native-brush-probe.mjs --built-worker
```

The new browser harness uses the actual inspector, Worker, transaction planner, canonical codec
and SVG exporter with an **isolated history host**. It is not a claim of full Studio application
E2E, physical-pen/mobile latency, or an OPFS crash-recovery test. Test images/logs/JSON stay in
ignored `.qa/engine-resume/`; the harness starts only loopback services and closes them in finally.

## Remaining target work

Direct live main-canvas engine selection, mixed-engine compositor handoff, reusable native MYB
preset payload persistence, sparse large surfaces, and physical mobile/stylus acceptance remain
separate work. This explicit conversion is a usable document workflow, not a silent promotion to
primary brush authority. There is no production deployment or change to third-party licenses.
