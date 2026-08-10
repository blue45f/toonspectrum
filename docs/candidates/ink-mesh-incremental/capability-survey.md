# Ink mesh incremental capability survey

Date: 2026-08-09
Scope: google/ink `1d0daba661f3035f42f3649b8e6a0061b47aa759`, committed Emscripten WASM

The repository has no Rust layer in the Google Ink mesh path. The inspected
path is direct C++ (`imk_bridge.cc`) → Emscripten WASM → TypeScript
(`ink-mesh.ts`). No unrelated Vello Rust bridge was changed.

## Candidates

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Upstream `InProgressStroke` retained across updates | Google Ink itself incrementally extends/mutates the existing `MutableMesh`; new pen inputs are enqueued once; bridge exports only a deterministic changed tail | Multi-coat deltas, a Vello triangle-mesh paint owner, physical stylus/CSP blind preference | Final positions, surface UVs, and indices were byte-exact against single-shot in 40/40 measured runs and unit partitions 1/7/31/160 | update 0.069750/0.085750/0.108125 ms; stroke p50/p95/p99 2.181334/2.401958/2.493042 ms | WASM linear heap 16,973,824 B; bridge transport vectors 9,588 B | WASM 541,737 B + MJS 16,681 B; incremental ABI adds 5,041 B over prior artifact; web/Worker/node target | Noise seed 0; repeated delta SHA-256 stable; exact final SHA-256 `546e27bb…de6cc` | Apache-2.0 upstream; first-party bridge | 11,336 B WASM→JS per 240-point stroke; 86.70% below repeated full snapshots and 85.90% below fallback | Pinned unstable upstream C++ API; direct-emcc subset must be rebuilt on pin changes | Authoritative live mesh session feeding the bounded `/studio` preview island |
| Retained single-shot `generateInkStrokeMesh` fallback | Already shipped reference behavior; each prefix is independently complete and failure isolation is simple | Remeshes and copies the growing full mesh for every live update | Same final mesh SHA-256 and same delta SHA-256 after JS-side diff | update 0.590625/1.110459/1.194333 ms; stroke p50/p95/p99 18.344667/18.728375/18.884375 ms | WASM linear heap 16,973,824 B; tracked input/full-mesh estimate 16,340 B | Uses the same artifact; no second bundle | Noise seed 0; byte-exact reference | Apache-2.0 upstream; first-party wrapper | 80,396 B WASM→JS per stroke before JS-side diff | Lowest API risk, but O(prefix) remesh/copy cost grows with stroke length | Mandatory runtime fallback and final-reference oracle |
| Studio WebGPU retained-buffer mesh island | Reuses `StudioGpuFabric`; applies retained-prefix/replacement-tail deltas with bounded `queue.writeBuffer` subranges and draws only the replaceable predicted triangle tail | Does not own committed Canvas/Konva paint, filters, erasing, symmetry, non-solid paint, export, or Vello scene ingestion | Uses the exact Google Ink mesh; predicted replacement is discarded on the next real suffix and the finished authoritative mesh remains byte-identical to single-shot | Product CPU/WASM values above; browser GPU frame timing not yet recorded | Positions/UVs/indices limited to 32 MiB total, each delta to 16 MiB, backing canvas to 16,777,216 pixels | No new bundle; uses existing committed WASM and shared WebGPU device | Revision/index/finiteness validation precedes queue mutation; final mesh parity and replacement semantics are automated | First-party TypeScript/WGSL over licensed upstream output | Direct typed-array tail upload; no GPU→CPU readback | WebGPU/device-loss variability; deliberately narrow admission surface | Real `/studio` predicted-tail preview; Canvas2D/Perfect Freehand remains primary paint owner and truthful fallback |

## Evidence-based selection

`InProgressStroke` is selected because all quality and determinism gates are
equal to the reference while measured update p95 is 12.95× lower and actual
WASM→JS geometry payload is 85.90% lower. This is not a visual approximation:
the final mesh is byte-identical. The current single-shot function remains
available and can be forced per session.

The incremental candidate is not declared CSP-superior. Predicted replacement
is now an automated product contract, but physical tablet feel, end-to-end
latency, and blind preference remain quarantined; those need human/device
evidence rather than synthetic timing.

## Product promotion status

The existing `/studio` pointer path now starts one incremental session after
the established live-ink admission gate. Coalesced authoritative `DrawEl`
suffixes advance the retained Google Ink session and GPU replica. Browser
predictions are expanded only into private preview data, replace the prior GPU
tail, and never enter `DrawEl`, history, or CRDT state. The next real suffix,
finish, cancellation, reset, or matching `StudioGpuFabric` device-loss epoch
removes that tail and destroys the owned geometry buffers.

This is a product promotion of a bounded mesh island, not a claim that Google
Ink or Vello owns the document canvas. The current paint owner is still the
verified Canvas2D/Konva live stroke and Perfect Freehand commit path. The exact
remaining engine boundary is a production Vello (or equivalent primary
surface) triangle-mesh ingestion API with blend/erase/filter/export parity.
