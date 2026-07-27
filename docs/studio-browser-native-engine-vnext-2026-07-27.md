# Studio browser-native engine vNext — 2026-07-27

## Decision

ToonSpectrum Studio will migrate from a DOM/main-thread scene authority to a browser-native,
worker-owned drawing engine.

The target is not “use WebGPU where convenient.” The target is:

1. React owns UI, accessibility, shortcuts, and pointer capture only.
2. A dedicated Engine Worker owns transient ink, the authoritative tile document, composition,
   and the `OffscreenCanvas` presentation surface.
3. A Storage Worker owns OPFS shards, the write-ahead journal, checkpoints, and crash recovery.
4. Bounded WASM kernels own profiled contiguous CPU work; Memory64 owns large logical address
   arithmetic and windowed working sets, not a permanently committed multi-gigabyte heap.
5. WebGPU is the primary Ultra backend. WebGL2 and the current Canvas/Konva path remain measured
   recovery paths until the replacement passes pixel, latency, persistence, and device-loss gates.

This decision supersedes the long-term “Konva remains the durable scene authority” conclusion in
`studio-canvas-engine-decision-2026-07-24.md`. Konva remains the shipping recovery authority during
the migration, but it is no longer the final architecture.

The superseded decision is not a constraint on new engine work. New drawing, document, persistence,
and collaboration capabilities must target the worker-owned tile architecture first; compatibility
adapters may project that authority back into the legacy scene only while migration gates require it.

## Why the decision changed

The existing hybrid engine has accumulated useful production seams:

- a real WebGPU live-ink renderer and tile compositor;
- coalesced, predicted, and raw pointer input handling;
- cross-origin isolation and SharedArrayBuffer-capable deployment headers;
- tiled-document, OPFS journal/checkpoint, worker, and device-loss modules;
- Memory64 kernels for large fill-mask analysis and morphology.

However, the high-frequency path still crosses the main thread, `StudioWebGpuEngine` is constructed
with an `HTMLCanvasElement`, Konva/PageState remains authoritative, and the tile/OPFS large-document
modules are not the live document owner. Adding more isolated accelerators would improve individual
operations without removing the main architectural ceiling.

The product now explicitly prioritizes drawing quality, large documents, and sustained performance
over broad legacy-browser compatibility. That changes the correct long-term trade-off.

## Unconstrained selection objective

Engine and library selection is now optimized only for:

1. observable output quality and editing fidelity;
2. input-to-visible latency, sustained frame time, and large-document throughput;
3. professional feature breadth and the speed at which new high-quality tools can be added; and
4. long-term replaceability of execution providers behind ToonSpectrum-owned document schemas.

The following are deliberately **not** selection gates: aggregate bundle bytes, dependency count,
install footprint, cold download size, duplicate implementation code, support for old browsers, and
the number of Worker/WASM entry points. They remain telemetry so that a later delivery-optimization
phase can split, cache, prewarm, or compress them without changing the document architecture.

This does not remove correctness requirements. Deterministic history, accepted pointer boundaries,
crash recovery, device-loss recovery, canonical color/text/path semantics, and bounded resident
memory are themselves product quality. A provider that loses work, corrupts a document, stalls the
pen path, or produces inconsistent export output is lower quality even when it exposes more
features.

Ultra-only capabilities may ship without a lower-tier equivalent. Standard and Compatibility
backends are recovery or migration aids, not reasons to reduce the Ultra implementation. A feature
can therefore require WebGPU, cross-origin isolation, SharedArrayBuffer, Memory64, OPFS sync access,
SIMD, threads, or a large specialist WASM engine when that combination produces the best measured
result.

## Current-to-target gap

| Capability | Current shipping path | Target authority |
| --- | --- | --- |
| UI and accessibility | React on the main thread | Keep |
| Pointer capture | DOM Pointer Events on the main thread | Keep; write normalized samples to SAB |
| Live rendering | Main-thread Canvas2D/WebGPU hybrid | Engine Worker + OffscreenCanvas |
| Document authority | `PageState[][]` + Konva scene | Versioned tile document in Engine Worker |
| Input transport | JS callbacks/owned arrays | SPSC SharedArrayBuffer ring; transferable batches as fallback |
| Large address space | Memory64 kernels and seam-only window runtime | Memory64 window allocator backed by OPFS shards |
| Persistence | snapshot/API paths plus OPFS utilities | Storage Worker journal + incremental tile checkpoints |
| Undo/redo | page/object snapshots and operation history | command log + changed-tile deltas + checkpoints |
| Collaboration | CRDT/presence transport around current state | canonical document commands and tile revisions |
| GPU recovery | implemented per WebGPU surface | rebuild from checkpoint + journal + retained dirty tiles |

## Target runtime

```text
Main Thread
  React UI / accessibility / shortcuts
  DOM pointer capture
  sample normalization
          |
          | SharedArrayBuffer SPSC ring
          | MessagePort control commands
          v
Engine Worker
  command serial actor
  authoritative tile document
  brush engine and transient prediction
  OffscreenCanvas
  WebGPU primary / WebGL2 fallback
  dirty-region compositor
          |
          +---- bounded transferable jobs ----> WASM Worker Pool
          |
          +---- journal/checkpoint protocol ---> Storage Worker
                                                    |
                                                    v
                                             OPFS shard files
```

The input ring carries only fixed-width numeric samples. Tool changes, document commands, receipts,
errors, and lifecycle transitions use a versioned `MessagePort` protocol. A sample is not durable
until the Engine Worker publishes an accepted-prefix receipt. Predicted points are presentation-only
and can never enter history, persistence, or CRDT operations.

## Memory64 policy

Memory64 removes the 4 GiB address-width ceiling; it does not make browser RAM unlimited.

- Logical offsets, tile addresses, archive offsets, and kernel pointers use `bigint`.
- The runtime reserves a bounded virtual maximum and commits pages on demand.
- JS views are bounded windows and are recreated after every observed `memory.grow`.
- Resident tiles have explicit CPU/GPU byte budgets and an eviction policy.
- Data outside the working set lives in sharded OPFS files whose local offsets remain safely
  representable by JavaScript and the File System API.
- A missing Memory64 capability fails closed for Ultra mode. Standard mode must be explicitly
  selected and uses the Memory32/transferable path.
- No feature may advertise “huge document support” merely because a Memory64 probe succeeds.
  The document is huge only after journal recovery, shard hydration, eviction, export, and undo
  pass end-to-end tests above 4 GiB logical offsets.

## Capability tiers

### Ultra

- Chromium secure context
- cross-origin isolation
- SharedArrayBuffer + Atomics
- OffscreenCanvas in a dedicated Worker
- Worker WebGPU
- Memory64 and WASM SIMD/threads where the selected kernel requires them
- OPFS `FileSystemSyncAccessHandle` in a dedicated Storage Worker

Ultra is the quality-first default only after all release gates pass.

### Standard

- OffscreenCanvas Worker
- WebGL2
- transferable input batches
- Memory32 bounded kernels
- async OPFS or IndexedDB persistence

### Compatibility

- current main-thread Canvas2D/Konva path
- no claim of Ultra latency or large-document capacity
- retained as recovery and migration comparison, not the final authority

Capability selection is probe-based and immutable for an active document session. A failure can
demote to a recovery backend only after the current accepted prefix and dirty-tile journal are safe.

## Hybrid engine portfolio

Bundle size, dependency count, and legacy compatibility are not selection constraints. Multiple
engines are allowed when each owns a different bounded responsibility and all durable output
crosses the canonical document protocol. Two libraries must not independently own the same layer,
history entry, text run, or live frame.

The overall document authority is always ToonSpectrum's versioned document kernel. Raster tiles,
editable paths, text content/style/font hashes, 3D asset references/transforms, animation tracks,
and command order use ToonSpectrum-owned schemas. CanvasKit, PixiJS, Paper.js, HarfBuzz, Three.js,
and every future vendor library are replaceable execution providers; their class instances, scene
graphs, caches, and opaque serialization are never durable document state.

| Responsibility | Preferred engine | Secondary/specialist use | Boundary |
| --- | --- | --- | --- |
| Live raster ink and tile composition | ToonSpectrum raw WebGPU | WebGL2 compatibility backend | One worker-owned tile/frame authority |
| GPU effect prototypes and animated assets | PixiJS v8 WebGL | WebGPU only in an isolated experiment until its production gate passes | Emits textures/tile commands; never owns document history |
| High-quality vector/text rasterization and export oracle | CanvasKit/Skia WASM | software surface for deterministic export | Separate Quality/Export Worker consumes canonical paths/glyph runs |
| Editable Bézier/path geometry | `polygon-clipping`, `flatten-js`, `bezier-js`, Earcut | Paper.js only after a headless geometry PoC | Geometry Worker returns versioned paths/meshes; no Paper scene authority |
| Freehand outline seed | `perfect-freehand` | custom Rust/WASM fitter for long/high-quality strokes | Source samples stay canonical so the fitter is replaceable |
| Multilingual shaping | HarfBuzz WASM | `opentype.js` for font inspection/path extraction; CanvasKit for raster | Canonical output is glyph IDs, clusters, offsets, and advances |
| 3D pose/background | Three.js + React Three Fiber | Babylon.js is an isolated lab, not a parallel production scene owner | Raster/depth/normal/line-art attachments cross a 3D bridge |
| Physics | deterministic Rapier WASM | engine-specific adapters | Fixed-step scene commands; no renderer-owned physics state |
| PSD and interchange | `ag-psd` today | specialized codecs/WASM workers by format | Canonical import/export schema, hard budgets, no UI objects |
| Heavy image analysis | Rust/WASM SIMD/threads | WebGPU compute for kernels that benefit from residency | Bounded buffers and deterministic direct oracle |

PixiJS v8 is a credible specialist because it has a Worker adapter and both WebGL/WebGPU renderers,
but its own documentation still recommends WebGL for production and describes WebGPU as
experimental. CanvasKit is valuable for Skia paths, paint, filters, and publication-quality
rasterization, but its WebGL/WASM lifetime and explicit object disposal make it a separate
Quality/Export Worker rather than a second owner inside the raw WebGPU hot path. HarfBuzz owns
canonical shaping; CanvasKit Paragraph must not independently reshape editable text.

### Adoption rules

1. Every engine gets an adapter implementing a ToonSpectrum-owned protocol; vendor objects never
   enter the saved document, CRDT operations, or public component props.
2. Engines are loaded as feature Worker chunks. Large WASM and shader packages may be prewarmed,
   but they do not increase main-thread parse or React commit work.
3. A specialist must win a corpus gate for its exact job: pixel quality, p95 latency, memory,
   cancellation, deterministic replay, device loss, and export parity.
4. GPU libraries render to isolated surfaces/textures by default. Sharing one context is allowed
   only with explicit state-reset and ownership tests.
5. Every allocation with manual lifetime (GPU resources, CanvasKit objects, WASM arenas, sync file
   handles) belongs to an epoch-scoped resource registry and is disposed in reverse dependency order.
6. Engine upgrades run the same golden documents before rollout. A vendor version is an
   implementation detail, never a document schema version.
7. Library breadth may grow; document authorities may not. There is one command order, one accepted
   stroke prefix, one tile revision graph, and one persistence journal.

## Migration slices

### Slice 0 — contracts and evidence

- Record p50/p95/p99 input-to-visible latency, long tasks, event delay, CPU/GPU memory, dropped
  samples, journal lag, and tile-cache churn.
- Version sample, command, frame-receipt, tile, and persistence protocols.
- Keep the current renderer as the pixel and recovery oracle.

### Slice 1 — zero-copy input

- Introduce a fixed-capacity SPSC SharedArrayBuffer ring with atomic publish/consume indices.
- Keep pointer capture and normalization on the main thread.
- Define overflow policy: preserve down/up/cancel boundaries, coalesce moves, count every drop.
- Replay the same corpus through shared and transferable transports and require identical committed
  samples.

### Slice 2 — worker-owned transient surface

- Transfer a dedicated canvas to an Engine Worker.
- Move only transient live ink and predicted presentation first.
- Keep committed Konva output visible underneath as the recovery oracle.
- Do not synchronously round-trip through React for each sample or frame.

### Slice 3 — tile authority mirror

- Mirror committed commands into the tile engine.
- Compare rendered pixels, hit regions, exports, undo/redo, and CRDT replay against the current
  authority.
- Implement dirty-tile residency, eviction, hydration, and device-loss rebuild.

### Slice 4 — OPFS authority

- Use a Storage Worker and exclusive sync access handles.
- Append a checksummed write-ahead record before acknowledging durable commands.
- Store changed tiles incrementally; checkpoint and compact without blocking input.
- Prove forced-worker-termination recovery at every journal boundary.

### Slice 5 — authority switch

- Make the Engine Worker tile document canonical for raster layers.
- Derive UI snapshots and compatibility presentation from versioned receipts.
- Migrate vector, text, panel, bubble, selection, mask, and 3D bridge objects by explicit document
  schema versions rather than serializing UI component state.

### Slice 6 — advanced GPU brush and color pipeline

- GPU dab instancing, smudge/wet media, mipmaps, non-destructive filters, Float16 working tiles,
  wide-gamut surfaces, and deterministic export conversion.
- Add only after the authority and recovery path is stable.

## Non-negotiable release gates

1. No lost pointer boundary or accepted committed sample under ring overflow, tab suspension,
   worker restart, or device loss.
2. No predicted point in undo, persistence, export, or collaboration.
3. Pixel-difference budgets pass for every blend, eraser, mask, transform, filter, and export
   corpus used by the compatibility renderer.
4. p95 input-to-visible latency improves on representative pen hardware; small strokes must not
   regress due to worker or WASM overhead.
5. A 30-second stroke, a 10-minute session, and a large multi-layer replay remain within explicit
   JS heap, WASM resident, GPU texture, and OPFS journal budgets.
6. Checkpoint + journal recovery succeeds after termination at every durable transition.
7. Device/context loss recreates all GPU objects from authoritative CPU/OPFS state.
8. A capability failure is visible and measurable; it may not silently impersonate the faster
   backend.

## Quality target beyond desktop incumbents

“Better than CLIP STUDIO PAINT” is treated as a measured product target, not a marketing assertion.
The browser cannot copy an incumbent's proprietary engine or file format, but it can exceed the
incumbent in selected workloads by combining specialized engines with collaboration, recovery, and
GPU-native workflows.

### Interactive drawing

- On the supported 120 Hz reference devices, pointer normalization, resampling, brush command
  generation, GPU submission, visible-tile composition, and overlays must fit within one 8.33 ms
  display interval at p95 for the normal pen corpus.
- The main thread must have no drawing-induced long task above 50 ms during a 30-second stroke.
- The accepted authoritative sample stream must be bit-for-bit identical across SAB and
  transferable transports. Predicted overlays may differ but must disappear on correction.
- G-pen, pencil, marker, airbrush, textured/scatter, watercolor, smudge, eraser, vector ink, and
  ruler-assisted strokes each get separate curvature, opacity, pressure, and replay golden sets.

### Large documents and reliability

- Sparse documents whose logical tile address exceeds 4 GiB and `Number.MAX_SAFE_INTEGER` shard
  boundaries must open, edit, undo, checkpoint, close, and recover without narrowing an address.
- 4K/10-layer, 8K/30-layer, 30,000 px vertical webtoon, 500 px brush, and long-session workloads
  have explicit resident CPU/GPU/OPFS budgets.
- Drawing remains responsive while journal flush, thumbnail generation, compression, export, and
  collaboration replay run in their workers.
- Worker termination, tab suspension, network loss, quota pressure, GPU device loss, and a torn
  checkpoint are mandatory fault-injection cases.

### Professional quality and feature breadth

- Canonical vector strokes preserve editable samples/paths and allow brush properties to be
  reapplied without destructive rasterization.
- HarfBuzz-shaped glyph runs cover Korean, Japanese, Chinese, Latin, vertical text, mixed scripts,
  OpenType features, and cluster-safe editing; rendering and export consume the same runs.
- Raster and vector masks, clipping, blend modes, selections, filters, color conversion, PSD
  interchange, webtoon panels/bubbles/effect lines, 3D line-art/depth bridges, animation, and
  collaboration all use the same command/history/persistence semantics.
- Engine/provider changes must improve a named golden corpus. More dependencies or more nominal
  features alone do not count as progress.

## Three-month and twelve-month adoption horizon

### Months 1–3

1. Move transient normal/erase ink to an OffscreenCanvas Engine Worker, then connect the SAB ring
   and existing WebGL2 fallback after transferable parity is proven.
2. Add a surface arbiter so the 2D document surface and active Three/motion surface are the only
   heavyweight contexts; hidden engines stop animation and release caches.
3. Build separate CanvasKit Quality/Export, HarfBuzz/opentype Text, and Geometry Workers. Keep all
   vendor packages out of the eager main-thread graph.
4. Connect one vertical feature per specialist: publication-quality bubble/effect-text export,
   multilingual/vertical shaping, one GPU vector fill, and Worker-based PSD import/export.
5. End Paper.js, PixiJS, and Babylon.js experiments unless each wins a named gate. Installing a
   library does not create a permanent architecture obligation.

### Months 4–12

1. Promote TileDoc from shadow parity to canonical raster authority one layer type at a time.
2. Connect GPU visible tiles, CPU resident tiles, OPFS journal/checkpoint shards, Memory64 windows,
   tile-diff undo, and collaboration revisions into one recovery graph.
3. Expand the custom GPU brush engine to texture/dual/scatter tips, masks, smudge, wet media,
   non-destructive filter graphs, mipmaps, Float16 linear-light, and Display-P3.
4. Use the HarfBuzz glyph-run and engine-neutral path schema across screen, SVG/PDF/PSD export, and
   collaboration. CanvasKit remains the quality renderer, not the editable data model.
5. Make 3D scenes render on demand, persist only canonical scene DTOs, and bridge depth/normal/
   line-art/animation assets into the 2D document.
6. Finish forced Worker termination, GPU loss, torn journal, offline PWA, huge-document hydration,
   and multi-user replay gates before removing the legacy authority.

## Immediate implementation order

1. Shared pointer ring and deterministic replay tests.
2. OPFS sync-access shard primitive restricted to a Storage Worker.
3. Versioned Engine Worker control and frame-receipt protocol.
4. OffscreenCanvas transient-ink vertical slice.
5. Tile-document live mirror and journaled persistence.
6. Authority switch only after the gates above pass.

This ordering deliberately separates irreversible ownership changes from reusable performance
primitives. Each completed slice remains useful even if a later backend is replaced.
