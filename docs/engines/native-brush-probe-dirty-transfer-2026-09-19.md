# Native brush trial and dirty-pixel transfer — 2026-09-19

Status: **current implementation: bounded Brush Studio trial canvas and native dirty-region API**.
Main-artwork live/commit, Undo/Redo, native preset persistence and reopened-document replay remain
**future integration**, not completed by this change.

## Merged foundation

The user requested the three previous engine PRs to be merged. Ordinary GitHub merges completed:

- Vello #1830: `5a3ee2da6ad76853d8b0c86b32aa62f7dd528df1`.
- libmypaint #1832: `73017bbab06c78799eb3ff482a8155b99278725b`.
- CanvasKit #1834: `eaabf9204c5457e8137cd79f9feb4ff382396c10`.

The follow-up starts from that merged main. The focused merged-main suite passed 670 tests,
with three pre-existing opt-in Google Ink checks skipped. Remote CI was queued when the
merges were made; branch protection had no required status checks or required review count.
No protection, workflow, hook, production configuration or deployment was bypassed or changed.

## Try the actual engines

Open Brush Studio, choose **엔진 조합 → 실제 엔진 시험 캔버스**, select one engine, then press
**시험 시작**. The selected provider is initialized before pointer input is accepted.
**시험 종료**, switching engines, unmounting, cancellation and terminal errors release the Worker.
The panel explicitly explains that the trial does not change main artwork or saved brush settings.

- libmypaint: real WASM, native ink/wash/chalk parameters, current size/color, pressure and tilt.
- CanvasKit: real WebGL2 surface and transferred ImageBitmap, using a pressure-generated outline.
- Vello: the same pressure outline, real adopted WebGPU device, GPUTexture-to-canvas copy and
  ImageBitmap. The trial does not use the CPU pixel-return reference renderer.

Only one engine Worker/request is active at a time. The canvas is 512×256, one stroke at a time,
with a maximum of 8,192 accepted samples and 128 samples per transmitted batch. These bounds
are trial limits, not a claim that the full-size product pipeline is solved. Existing app document
and brush preset authority remain unchanged.

## Native transfer contract

A native surface-local dirty rectangle accumulates each `end_atomic` ROI, clipped to surface
bounds. The bridge copies only intersecting tiles to packed straight-alpha RGBA8. JavaScript
acknowledges dirty state only after the copy succeeds. A failed allocation therefore cannot
silently discard dirty pixels. Complete-frame reference/export APIs retain the previous results.

`takeDirtyFrame()` returns `{x,y,width,height,pixels}` or null; `finishDirty()` resolves the tail
once and returns only pending dirty pixels. Consumers **replace** these pixels, including
transparent/eraser changes. Source-over blending the patch again would double-apply opacity.

The surface allocation remains bounded, not sparse residency: native fix15 storage and WASM
heap memory still exist. This change reduces extracted/transferred pixel bytes; it does not
claim equivalent reductions in total application memory, frame time or physical pen latency.

The existing libmypaint source commit and Emscripten 6.0.6 pins remain unchanged. The build now
includes the Worker environment, verifies the compiler pin, and refreshes artifact integrity
and third-party inventory hashes without modifying reviewed component/license content.
Two local rebuilds produced byte-identical glue/WASM. The upstream RAND_MAX conversion warning
is still emitted by the compiler; it was not hidden or treated as a new app warning.

## Observed browser result

Chrome 153.0.8010.48 / Apple M2 Max. A real React trial component drove all three Dedicated
Workers through init, pointer input, rendering and finish. Each engine displayed visible pixels.
The test policy permits WASM compilation but not JavaScript unsafe-eval; Worker bootstrap
configures Zod jitless before dynamic provider imports. No page/CSP errors were observed.

For one deterministic 64-sample wash at 512×256, sent in batches of four:

| Measurement | Result |
| --- | ---: |
| Pixel-bearing/empty update replies including finish | 17 |
| Equivalent whole-frame pixel bytes | 8,912,896 |
| Actual packed dirty pixel bytes | 81,528 |
| Pixel transfer reduction for this fixture | 99.0853% |
| Reconstructed vs whole-stroke mismatched bytes | 0 |
| Maximum concurrent Workers / Workers left after test | 1 / 0 |

These are fixture measurements, not a benchmark of general app speed, cross-device fidelity,
physical stylus behavior, driver-internal zero-copy, or main-document save/undo integration.
CanvasKit/Vello may differ at antialiased edge pixels even with the same geometry; cross-engine
pixel identity is not asserted.

## Reproduction

```sh
bash packages/studio-brush-platform/src/libmypaint/bridge/build.sh
pnpm --filter @toonspectrum/studio-brush-platform typecheck
pnpm exec tsc -p tests/benchmarks/harness/tsconfig.json
pnpm exec vitest run packages/studio-brush-platform packages/studio-engine-skia \
  apps/web/src/domains/creator/brush/studio-native-brush-probe.test.ts --maxWorkers=1
node scripts/verify-studio-native-brush-probe.mjs
pnpm run build
node scripts/verify-studio-native-brush-probe.mjs --built-worker
```

The browser verifier uses only a loopback server and closes its browser/server in `finally`.
The `--built-worker` mode substitutes the actual emitted production Worker/dependencies while
retaining the same trial UI and assertions. Reports/screenshots are local ignored artifacts in
`.qa/engine-resume/`; they are not committed. No production deployment is performed.

## Remaining product work

Preserve native MYB source bytes and engine/adapter identity in saved presets; connect an explicit
main-document provider selector/prewarm; add canonical live-to-commit handoff, compositor ordering,
Undo/Redo and save/reopen/export receipts. Wider surfaces need sparse storage and dirty-tile queues,
not unlimited full-surface allocation. Mobile and physical pen quality/performance validation are
separate acceptance gates. Main brush settings must not silently select this trial implementation.

## Final local verification

The final focused suite passed **710 tests**, with the same three pre-existing Google Ink
opt-in checks skipped. The separate third-party notice/provenance regression suite passed
**15 tests**. Frontend production build, postbuild third-party notices and static HTML CSP
verification passed. Dependency-size/eval/deprecation build warnings remain; a successful
build is not a claim that every unrelated dependency warning has been eliminated.

The real browser verifier also passed with the production-emitted
`studio-native-brush-probe.worker-C_SFu21I.js` and its actual emitted WASM/dependency assets,
served under strict CSP. The three engines displayed the same fixture results listed above;
packed MyPaint reconstruction still differed by zero bytes. The source-only React fixture
was retained around that compiled Worker; this does not certify the full application shell,
main-artwork transactions, or any production deployment.
