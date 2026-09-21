# Skia GPU document migration acceptance — 2026-09-22

Status: implemented bounded migration; not a complete editor-engine replacement.

## Continuation and scope

The interrupted `feat/skia-primary-renderer-20260922` work was recovered, including its original stroke planner, persistent WebGL2 renderer, receipt-gated Stage handoff, and in-progress camera adapter. Concurrent changes in that worktree were preserved. An independent snapshot is validated on `fix/skia-gpu-acceptance-20260922`; no original worktree or unrelated process is overwritten.

Automerge is deferred. Yjs, immutable source strokes, editor commands, Undo and SQLite/OPFS remain authoritative. CanvasKit 0.41.1 uses WebGL2 for this surface; this is not a completed WebGPU conversion.

## Implementation

- Retained element SkPictures and 128-item composite batches. Append recompiles one affected batch and paints the new item rather than re-recording a document-wide picture. Metadata comparisons still scale with the document; this is not an O(1) whole-editor claim.
- Explicit GPU/resource cleanup, at most three/32MiB logical viewport snapshots, 128MiB picture admission and a requested 64MiB GPU resource-cache limit. Actual driver memory can be unknown; these are not a measured total-process peak.
- Exact requested-revision validation and cancellation of pending publication on device loss. A stale success cannot re-enable a lost surface.
- Snapshot descriptors retain stable revision tokens instead of entire historical source objects. Resizing clears incompatible snapshots and invalidates an externally resized backing buffer.
- Scoped imperative camera events read the actual Stage transform, including viewport scroll offsets, and coalesce into one animation frame.
- A local draft already admitted by the existing document-lock projection may display before optional remote synchronization is ready. Remote/joined hydration and existing asset/preview gates remain intact. No mutation/lease/server-save permission is created.
- Canonical pen/marker/eraser source and paint semantics are preserved. Visible unsupported content is not omitted or approximated to pass the GPU gate.

## Verified behavior

- Unit coverage includes retained batches, changed-item compilation, bounded image lifetime, dispose, loading failure, superseded requests, exact source receipts, camera subscriptions and missing/remote/local frontier distinctions.
- Actual Chromium 151 (ANGLE Metal / Apple M2 Max) and Firefox 153 renderer tests exercise 3,000/10,000 strokes, 100 append/undo cycles, independent GPU contexts, DPR resize, rotation/reflection, and real context loss followed by explicit same-engine recovery.
- The 10,000-stroke renderer sequence retained 5,130,876 bytes of picture records. One measured 100-cycle run reported append CPU-submission P95 3.8ms in Chromium and 6ms in Firefox. These are not pointer-to-photon, complete document commit, driver memory, or physical pen measurements. Other verification processes were active on the same Mac.
- The real `/studio/canvas` UI test creates three ordinary pointer strokes, switches to one visible Skia surface, operates zoom/90-degree rotation and follows existing Undo/Redo. It uses no fabricated source revision, permission override, API authentication stub, or engine-name-only assertion.

## Reproduction

```sh
pnpm exec vite --host 127.0.0.1 --port 5278 --strictPort
# Independent renderer fixture and real product route; a normal Chromium binary is required.
node scripts/verify-studio-skia-document-engine.mjs http://127.0.0.1:5278 chromium,firefox
node scripts/verify-studio-skia-product.mjs http://127.0.0.1:5278
pnpm run typecheck
pnpm run build:bundle && pnpm run check:studio-bundle
```

The product runner can also target a loopback server serving the built `dist/`.
Screenshots and JSON reports are generated under `artifacts/skia-document/` and `artifacts/skia-product/`, not committed source.

## Limits and negative evidence

The default Chromium headless-shell was observed using SwiftShader, not physical GPU hardware. Its dense camera-repeat attempt exceeded the bounded run; it is not counted as a hardware performance success. The runner now uses the documented regular Chromium channel and records the actual driver instead of assuming GPU acceleration from the API name. Firefox may mask its GPU name.

Current canonical input, committed-stroke fences, selection, complex images/text/masks/filters, natural-media providers and exports still retain existing compatibility boundaries. A change to unsupported content may leave this bounded display slice. Full removal of Konva/Canvas2D, 30/120-minute real-device operation, complete original-file/export parity, and end-to-end large-document latency remain separate acceptance gates. No tests, image thresholds, CI protections or bundle ratchets were relaxed. No production deployment was performed.
