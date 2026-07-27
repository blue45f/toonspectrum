# Studio drawing performance track — 2026-07-22

> **Historical rollout policy:** The measured safety requirements remain active, but the
> long-term main-thread ownership decision is superseded by
> `studio-browser-native-engine-vnext-2026-07-27.md`.

## Outcome

ToonSpectrum keeps the interactive canvas, pointer capture, hit testing, brush cursor, accessible
DOM overlays, and scene ownership on the main thread. CPU-heavy jobs with bounded inputs move to
Workers; compatible retained composition can use WebGPU; Canvas 2D remains the exact fallback.
This avoids a full editor rewrite while improving the latency-sensitive path.

## Shipped in this pass

| Area | Change | Safety boundary |
| --- | --- | --- |
| Pen cursor latency | An active pen contact listens to `pointerrawupdate` and updates only the outline cursor. | Durable geometry, pressure, ruler locks, QuickShape, history, and CRDT still consume the following processed/coalesced `pointermove`. The high-rate listener is removed on pointer release and is never installed for mouse/touch. |
| Canvas 2D presentation | Live ink, predicted ink, and stamp overlays request a desynchronized 2D context. | Older WebViews that reject the option fall back to an ordinary 2D context. |
| Large/high-DPI displays | Transient Canvas/WebGPU live surfaces use native DPR until their backing store would exceed 16,777,216 pixels, then quantize down in 0.25 DPR steps. | Document coordinates, committed Konva content, saves, and exports are unchanged. Typical 1080p/2× and 430×932/3× surfaces stay native. |
| WebGPU coalesced input | A compatible pinned GPU stroke clones its retained prefix once per browser delivery and mutates the private batch for all coalesced samples. | The asynchronous GPU recovery command never receives a mutable array. Fixed-rate input keeps its existing owned-array path and does not pay a redundant clone. |
| Long-stroke correction Worker | Worker-worthy release correction uses a one-shot module Worker with `Float64Array` Transferables inside the existing 200ms deferred-commit window. | Only ordinary freehand strokes above the measured 2,048-point/32KiB/kernel-work thresholds leave the main thread. Request/generation IDs, abort, a 175ms editor deadline, hard byte budgets, stale-result rejection, and the unchanged authoritative stroke make failures lossless. |
| WebGL2 compatibility boundary | A bounded shader/VAO/VBO renderer can draw a variable-width transient strip, recover from context loss, and fail closed to Canvas. | It is intentionally not the default: the current Canvas overlay appends O(1), while rebuilding and uploading a full strip is O(N) and does not yet match round-dab pixels. The boundary is ready for an instrumented compatibility canary only. |
| Smart filters | 37 non-destructive filters run Worker-first with deterministic direct fallback. | Request validation, alpha preservation, direct/Worker parity, abort, and stale-result protection remain enforced. |

## Why the entire editor is not moved to a Worker

An `OffscreenCanvas` can run in a Worker and can reduce display latency when the main window event
loop is busy. It is a good fit for isolated raster replay, encoding, filtering, selection masks,
and other jobs with explicit input/output ownership. Moving the whole Konva editor would also move
pointer capture, picking, DOM overlays, accessibility, text editing, and scene ownership across a
message boundary. That migration has a much larger correctness and debugging cost than the
remaining measured input latency.

Primary reference: [HTML Living Standard — Canvas and OffscreenCanvas](https://html.spec.whatwg.org/multipage/canvas.html).

## WebGPU policy

WebGPU is used only when the surface is warm and the brush/compositing contract is proven. Canvas
2D stays visible if initialization, the first-frame receipt, suffix validation, or recovery fails.
GPU device loss invalidates all objects created by the device, so every WebGPU adoption must retain
a bounded authoritative recovery source and recreate resources rather than attempting to reuse
them.

Primary reference: [GPUWeb specification — devices and device loss](https://gpuweb.github.io/gpuweb/).

The live-ink default remains Canvas 2D until the GPU-owned chunk feed demonstrates a lower p95 on
real Apple/Intel/AMD/NVIDIA/Adreno/Mali devices without growing recovery memory. `webgpu` remains an
explicit rollout option during that evidence-gathering phase. Production canaries can instead keep
the backend on `auto` and set `VITE_STUDIO_LIVE_INK_ROLLOUT_PERCENT`: the browser stores only one
local 0–9999 percentile bucket (not a user/device identifier), admits the same cohort as the
percentage grows, and fails closed when storage, Web Crypto, the WebGPU API, the adapter, the device,
the stroke contract, or its first-frame receipt is unavailable. Missing or malformed percentages
remain 0%. `VITE_STUDIO_LIVE_INK_KILL_SWITCH=on` dominates even an explicit `webgpu` build and is
the immediate fleet-wide rollback path; `canvas2d` remains the explicit backend fallback.

The cohort calculation now uses the common Studio feature-rollout core. That core also provides
versioned and expiring validated-remote policies, checksum-protected last-known-good recovery,
dependency gates, production-authorized QA overrides, and version-scoped failure cooldowns without
adding a runtime network request. A remote policy is never admitted until its verification boundary
marks it validated and the exact policy has been durably stored as last-known-good.

## Pointer Events policy

Pointer Events Level 3 specifies that `pointerrawupdate` should be dispatched as soon and as often
as the page can handle, before the corresponding `pointermove`. It also warns that installing a raw
listener can hurt performance. ToonSpectrum therefore installs it only for the duration of an
active pen contact and uses it for a frame-coalesced cosmetic cursor update, never for durable ink.

Primary reference: [W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/).

## WebAssembly policy

Wasm is appropriate for large, numeric, contiguous kernels after profiling shows that computation
dominates JS↔Wasm copying and call overhead. Candidate kernels are large selection/fill masks,
convolution/median filters, mesh simplification, texture codecs, and long-stroke post-processing.
It is not automatically faster for short pointer batches or DOM/Canvas calls. The current KTX2
codec already uses a pinned, integrity-checked Wasm runtime; drawing kernels must meet the same
version, byte-budget, cancellation, and deterministic-parity requirements before adoption.

Primary reference: [WebAssembly specifications](https://webassembly.github.io/spec/).

## Release gates for the next performance steps

1. Capture p50/p95/p99 input-to-visible latency for Canvas 2D and WebGPU on the same replay corpus.
2. Record long-task count, browser event duration, backing-store bytes, JS heap, and GPU allocation
   counters during 30-second and 10-minute strokes.
3. Require zero differences in durable point order, pressure alignment, ruler snapping, undo,
   autosave, CRDT replay, and exported pixels.
4. Require device/context-loss recovery and foreground/background recovery without losing the last
   accepted prefix.
5. Adopt a Worker/Wasm kernel only when large inputs improve p95 by at least 25% and small inputs do
   not regress through serialization overhead; otherwise keep the direct path.
6. Keep Worker pools bounded, use request/generation IDs, AbortSignal, hard timeouts, Transferable
   buffers, stale-result rejection, crash disposal, byte budgets, and deterministic direct parity.

## Next candidates, in order

1. OffscreenCanvas Worker replay for settled specialty brushes, isolated from live pointer input.
2. Worker/Wasm A/B for large magic-wand/fill masks and median/convolution filters.
3. Expand the now-bounded WebGPU `auto` cohort only after each real-device gate passes; compare the
   same locally captured corpus at every percentage step and roll back to `canvas2d` on regression.
4. Run the WebGL2 live-strip boundary as a compatibility canary only after adding backend latency
   telemetry and round-cap parity; keep Canvas authoritative until it wins the release gates.
