# CanvasKit GPU island continuation — 2026-09-19

Status: **implemented package runtime; product brush lifecycle wiring remains pending**.

## Implemented

`createSkiaGpuIslandBackend` now consumes `SceneIR` using an explicitly constructed
WebGL2 context, `GrDirectContext`, and `MakeOnScreenGLSurface`. It returns a caller-owned
`ImageBitmap`. The CPU renderer remains an independent reference/export lane; no
software fallback or automatic cross-engine replacement is introduced.

The runtime orders concurrent submissions, keys its revision cache by backing size and
scene/font identity, bounds allocations, releases partial allocations, and rejects further
rendering after a GPU failure or context loss. Callers must keep scene/font data immutable
within a revision, close transferred bitmaps, and dispose the backend when leaving its scope.

The npm runtime does not expose `setCurrentContext` as a stable public API. Public Canvas
methods use the context attached by `Surface.getCanvas()`; calling the implementation-detail
method was caught by the real-browser check and removed.

## Reproduction

```sh
pnpm --filter @toonspectrum/studio-engine-skia typecheck
pnpm exec vitest run packages/studio-engine-skia --maxWorkers=1
node scripts/verify-studio-canvaskit-gpu-island.mjs
```

The browser verifier opens only a loopback Vite fixture, uses the installed Chrome channel,
and shuts down its browser/server in `finally`. It neither loads production credentials nor
deploys anything. Port 5277 must be free; the script fails instead of taking over another service.
Generated JSON and screenshots live under ignored `.qa/engine-resume/`.

## Observed local result

Chrome 153.0.8010.48, ANGLE Metal / Apple M2 Max: a 64-sample pressure-varying
Perfect Freehand outline produced 2,505 visible pixels and alpha mass 423,024 at
160×96. Replaying it and resizing to 192×96 retained those figures. The selected path
made zero explicit WebGL `readPixels` calls. The diagnostic Canvas2D pixel read happens
only in the verifier, after the output bitmap has been transferred. Context loss was
reported as `unavailable` without automatically replacing the engine. Page errors: zero.

These results verify this small isolated runtime case, not cross-device determinism,
end-to-end pen latency, a full Studio integration, dirty-tile performance, or zero-copy
behavior inside the browser/driver. The test currently submits complete island scenes.

## Remaining product boundary

Brush Studio still needs an explicit UI selection, capability/prewarm admission, a Worker
owner, ordered live/commit handoff, bitmap-to-document compositor integration, and
save/undo/reopen/thumbnail/export acceptance before this can be called a product brush
backend. Do not change the product role ledger or present a metadata-only switch as completed
integration. Existing Canvas2D and other explicitly chosen providers retain their current roles.
