# Skia GPU drawing migration: resumed integration candidate

Status: **implemented candidate; not a complete editor cutover or production release**.

The original work was found at `toonspectrum-skia-primary-20260922`. Concurrent edits were observed in its browser fixtures, so its tracked and untracked source was snapshotted without removing anything, then continued at `toonspectrum-skia-gpu-stabilization-20260922` (`fix/skia-gpu-stabilization-20260922`). Automerge changes in the separate history worktree are not included.

## Implemented

- CanvasKit 0.41.1, direct WebGL2 document surface, with no interactive pixel readback or CPU-surface substitution.
- Exact existing causal pen/marker/finalized direct-eraser geometry and the previously admitted vector subset. Source strokes, Yjs, storage and Undo remain authoritative.
- Immutable element pictures plus bounded 128-item composite batches. Normal append compiles one changed element and one batch, and paints only the append. Metadata validation still traverses the visible source list; this is not a constant-time whole editor.
- Bounded GPU-only previous-viewport snapshots for visual restore. Snapshot keys retain numeric revision tokens, not historical raw point/dab arrays. This cache is not document history.
- Exact revision receipts, publication/commit fence cancellation, late-reply guards, and explicit same-engine recovery after device loss.
- Live Stage camera subscription for clipped scrolling, zoom and rotation. The GPU surface follows actual input coordinates without routing each pan through the settled React snapshot. Temporary camera changes are coalesced; canonical input is not dropped.
- Transparent frame clipping remains outside the admitted subset. Unsupported content is not silently omitted or approximated.
- Failure and disposal release GPU pictures/surfaces/context. Browser tests have bounded timeouts rather than hanging indefinitely.

## Observed verification

- Focused kernel/surface/projector/camera/fence tests: 35 passed at initial isolated checkpoint.
- Expanded Skia/registry/geometry/viewport tests: 501 passed, 4 pre-existing environment-dependent tests skipped. Skipped tests are not counted as passed.
- Web and API type checks, Skia package type check and changed-source lint passed at that checkpoint; later source commits require exact-head revalidation.
- Production build and CSP verification passed. Existing bundle threshold was unchanged: 0 regressions; Studio after app shell 5910.6KiB raw / 1986.2KiB gzip.
- Actual WebGL hardware run: Chromium with an explicit macOS Metal test option and Firefox both passed 9 scenario groups (18 total), including canonical ink comparisons, interleaved contexts, DPR resize, 10000 strokes, camera reuse, real device-loss injection and same-engine pixel-exact recreation.

### Hardware measurement scope

The latest 100-iteration append/undo run at 10000 short canonical strokes measured CPU submission P95 3.7ms in Chromium/ANGLE Metal on M2 Max and 6ms in Firefox. Both returned to 5,130,876 retained picture bytes and 79 composite batches after Undo. This is not physical pen-to-photon latency, full-editor FPS, all brush-family parity, or 30/120-minute endurance certification. Driver GPU cache usage was unavailable (`null`).

Default headless Chromium selected **SwiftShader software Vulkan**, not the machine's hardware GPU. That run timed out during 10000-stroke camera replay at the explicit 180-second deadline. It is recorded as a failure, not relabelled a success. The explicit macOS Metal run used the same assertions and stroke counts, with the backend recorded in the report. No production renderer silently changes backend after a failure.

### Actual application probe and outstanding release gates

The production `/studio/canvas` probe mounted the real editor, but the unauthenticated local test could not append its first stroke: its live provider reported `인증된 팀 연결 정보가 없어 로컬 모드로 자동 전환하지 않았습니다. 다시 로그인해 주세요.` and `studioCrdtOperationSyncReady` remained false. Accordingly the GPU gate stayed disabled with an empty document. That is **not** proof that the real drawing flow has passed. No authentication/lease/CRDT safety rule was bypassed to manufacture a renderer success.

Before a broad cutover: verify the actual authenticated/local-authorized drawing path, high-zoom imperative scrolling, specialised brushes, image/text/mask/filter combinations, export, and physical-device endurance. The current compatibility boundary remains for unsupported scenes and input/selection. Do not report this candidate as complete removal of Konva/Canvas2D.

## Reproduction

```sh
pnpm exec vite --host 127.0.0.1 --port 5276 --strictPort
node scripts/verify-studio-skia-document-engine.mjs http://127.0.0.1:5276
# macOS explicit hardware experiment; records the actual renderer
node scripts/verify-studio-skia-document-engine.mjs http://127.0.0.1:5276 metal
pnpm --filter @toonspectrum/studio-engine-skia run typecheck
```

`artifacts/skia-document/report.json` and screenshots are generated evidence, not source. Do not run Vite source-generating builds during browser measurements: generated-source HMR can destroy the test execution context. No production deployment, database, domain, environment or CI threshold was changed.
