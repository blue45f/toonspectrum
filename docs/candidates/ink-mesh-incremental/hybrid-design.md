# Ink mesh incremental hybrid design

## Decision

Use the pinned upstream `InProgressStroke` as the default live geometry owner
and retain `generateInkStrokeMesh` as both the exact final oracle and runtime
fallback. The stable ToonStudio protocol is
`toon-ink-mesh-delta-v1`; no engine object enters project IR.

## Incremental flow

1. `createInProgressStroke()` allocates one bridge handle and calls
   `InProgressStroke::Start()` with noise seed 0.
2. `append(points)` accepts at most 65,536 newly modeled points. The C++ bridge
   creates only that input batch, calls `EnqueueInputs()` and then
   `UpdateShape()` on the retained stroke.
3. The bridge compares the new Google Ink mesh with its prior flattened
   snapshot and finds a joint position/surface-UV vertex prefix plus a triangle
   prefix.
4. The delta carries:
   `baseRevision`, `revision`, `operation`, retained counts, replacement tails,
   final counts, input count, and finished state.
5. `applyInkStrokeMeshDelta()` validates revision, lengths, finiteness, and
   index bounds before rebuilding the CPU replica. The `/studio` mesh island
   applies the same truncate-and-append operation to retained position, UV,
   and index buffers with bounded `GPUQueue.writeBuffer` calls. It does not map
   or read a GPU resource in the interactive path.
6. `finish()` calls `FinishInputs()` and one final `UpdateShape()`. The final
   snapshot must be byte-identical to a single-shot generation of the same
   points and brush parameters.

Operation semantics are deterministic:

- `append`: retained counts equal the complete prior mesh; only a new tail is
  added.
- `update`: a previous tail is replaced or truncated, as is normal while the
  current cap settles.
- `noop`: no geometry bytes, but the protocol revision advances (normally the
  final seal for a non-animated brush).

## Input fidelity

The ABI uses six f64 values per point: x, y, seconds, normalized pressure,
tilt radians, and orientation radians. Optional-channel presence must be
consistent for the stroke, matching upstream validation. Pressure is tested
through size behavior and tilt through rotation behavior. All values are
validated before allocation; float overflow, NaN, infinity, invalid ranges,
and reverse time are rejected.

## Failure and fallback

- Loader/ABI/provider policy can select the explicit
  `single-shot-fallback` session.
- A negative C status faults and destroys the retained handle; no poisoned
  stroke is reused.
- `reset()` reuses upstream allocations and restarts revision 0.
- `cancel()` and `dispose()` destroy the handle and reject later use.
- The fallback retains all input points, runs the existing single-shot API for
  each prefix, and derives the same v1 delta in TypeScript. It is slower and
  crosses more WASM bytes, but its final result is the reference.

## Actual `/studio` product boundary

The integration is intentionally placed at the existing live-stroke island:

1. `collectStudioStrokePointerBatch()` supplies coalesced authoritative input
   and a separately marked predicted suffix.
2. The established Canvas2D/Konva path creates and continuously retains the
   authoritative `DrawEl`; it remains the one primary paint owner.
3. After that path is admitted, `StudioInkMeshLivePreviewRuntime.begin()`
   starts the pinned upstream `InProgressStroke` with the same pressure,
   altitude/tilt, azimuth/orientation, twist, and sample-time semantics.
4. Each authoritative publication calls `synchronizeAuthoritative()`. Only the
   newly coalesced suffix enters the upstream session. The resulting retained
   prefix/replacement tail is validated before any GPU queue mutation.
5. A browser prediction is reconstructed from Studio's compact preview draft
   into private transient input, generated as a replacement target, and drawn
   from its first changed triangle. It never advances the authoritative input
   count. The next real input restores the exact authoritative GPU replica.
6. `finish()` verifies the retained session's final mesh, while normal Studio
   history/CRDT commit continues through the unchanged Perfect Freehand path.

The mounted `StudioInkMeshLivePreviewHost` is a clipped, pointer-transparent
canvas over the existing viewport. It reuses `StudioGpuFabric`; it does not
create a second device owner. Only the replaceable predicted tail is visible
from this canvas. The retained Canvas2D stroke remains visible and fail-safe,
so device loss cannot erase or corrupt the user's authoritative ink.

Admission is bounded to 32,768 input points, 524,288 vertices, 1,048,576
triangles, 32 MiB resident geometry, 16 MiB per delta, and 16,777,216 backing
pixels. Revision, count, length, finite-value, index, subrange offset, and
device-buffer limits produce explicit fallback receipts rather than no-ops.

## Boundaries and quarantine

This slice wires a real product preview renderer and prediction queue, but does
not claim full canvas ownership. Vello currently has no product triangle-mesh
ingestion seam with the existing blend/erase/filter/export contracts; replacing
that owner would be a broader invasive change. Multi-coat paint, browser GPU
timing, CSP blind preference, and physical stylus feel/latency remain explicit
gates.
