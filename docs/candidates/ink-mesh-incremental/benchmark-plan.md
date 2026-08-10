# Ink mesh incremental benchmark plan

## Objective

Promote upstream `InProgressStroke` only if it preserves the exact final
single-shot mesh and provides measured latency/payload value without relaxing
input, lifecycle, or resource safety.

## Reproducible commands

```shell
pnpm exec vitest run \
  packages/studio-brush-platform/src/__tests__/ink-mesh.test.ts \
  packages/studio-brush-platform/src/__tests__/ink-mesh-incremental.test.ts \
  src/domains/creator/studio-ink-mesh-live-preview.test.ts \
  src/domains/creator/studio-ink-mesh-live-product-wiring.test.ts \
  src/domains/creator/studio-live-ink-overlay.test.ts \
  tests/visual/ink-mesh-vello-smoke.test.ts
pnpm exec tsx tests/benchmarks/harness/ink-mesh-incremental.ts
```

The harness executes the committed Emscripten WASM directly in Node 24. It
uses no mock and writes
`tests/benchmarks/results/ink-mesh-incremental.json`.

## Workload

- Apple M2 Max, darwin 25.6.0, Node v24.16.0.
- 240 deterministic modeled points, 8 points/update, 31 calls including
  finish, 5 warmup strokes, 40 measured strokes.
- All six channels populated: x/y/time/pressure/tilt/orientation.
- Brush size 12, epsilon 0.1, anisotropic scale, pressure-size behavior, and
  tilt-rotation behavior.
- Candidate A: retained upstream `InProgressStroke`.
- Candidate B: current single-shot fallback for every growing prefix.

## Required gates

| Gate | Requirement | Result |
|---|---:|---:|
| Final quality | Positions, UVs, and indices byte-exact to single-shot | Pass, 40/40 benchmark runs and chunk partitions 1/7/31/160 |
| Determinism | Repeated operation metadata and typed-array tails byte-identical | Pass; delta SHA-256 `ba8f554c…201ee` |
| Update latency | p95 below 8.33 ms 120 Hz budget | Pass; 0.085750 ms |
| Payload | Incremental WASM→JS below repeated full snapshots | Pass; 11,336 B vs 85,216 B (−86.70%) |
| Candidate value | Incremental payload/latency better than fallback | Pass; −85.90% payload, 12.95× lower update p95 |
| Pressure/tilt | Observable upstream behavior and exact final parity | Pass |
| NaN/overflow | Reject before WASM allocation | Pass |
| Resource caps | 65,536 per append; 1,000,000 per stroke | Pass |
| Lifecycle | reset/cancel/dispose/error state tested | Pass |
| Product wiring | Existing `/studio` pointer path and viewport host consume the runtime | Pass; source boundary contract plus runtime tests |
| Predicted replacement | Prediction never advances authority and is replaced by next real suffix | Pass; compact-draft expansion and repeated replacement tests |
| GPU upload | Exact retained vertex/triangle offsets and changed byte lengths | Pass; position/UV/index `writeBuffer` receipts asserted |
| Device loss | Owned buffers disposed and verified Canvas2D/Perfect Freehand path survives | Pass; matching fabric epoch test |
| GPU readback | Zero in interactive hot path | Pass; runtime contract reports 0 and contains no read/map/copy-to-CPU API |

## Recorded measurements

| Candidate | Update p50/p95/p99 ms | Stroke p50/p95/p99 ms | WASM→JS B/stroke | Max delta B | Bridge vectors B | WASM heap B |
|---|---:|---:|---:|---:|---:|---:|
| Upstream incremental | 0.069750 / 0.085750 / 0.108125 | 2.181334 / 2.401958 / 2.493042 | 11,336 | 564 | 9,588 | 16,973,824 |
| Single-shot fallback | 0.590625 / 1.110459 / 1.194333 | 18.344667 / 18.728375 / 18.884375 | 80,396 | 564 after JS diff | 16,340 tracked estimate | 16,973,824 |

## Remaining non-automatable gates

- Browser Dedicated Worker and real WebGPU frame timing are not recorded by
  this bounded slice; GPU tests validate the exact queue contract with a fake
  device while product code uses the shared real `StudioGpuFabric` adapter.
- Physical tablet pressure/tilt feel and CSP blind preference require human
  sessions on target hardware.
- Multi-coat and full Vello/primary-surface triangle ownership need separate
  product evidence. The implemented island owns only the predicted live tail.
