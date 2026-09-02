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
5. WebGPU is the only production raster authority targeted by vNext. WebGL2 and the current
   Canvas/Konva path may remain as diagnostic comparison or temporary document-view adapters, but
   vNext quality, persistence, and release decisions are not constrained by their ceilings.

This decision supersedes the long-term “Konva remains the durable scene authority” conclusion in
`studio-canvas-engine-decision-2026-07-24.md`. Konva remains a temporary shipping bridge during the
migration, but it is no longer a recovery authority that vNext must preserve or reproduce.

The superseded decision is not a constraint on new engine work. New drawing, document, persistence,
and collaboration capabilities must target the worker-owned tile architecture first. Read-only
migration adapters may inspect receipts, but they may not feed state back into the authority or
delay an engine capability because the legacy scene cannot represent it.

## Previous-engine compatibility boundary

The new authority does not preserve the previous ToonSpectrum engine's internal contracts:

- legacy brush IDs, Canvas/Konva nodes, scene serialization, caches, history snapshots, and
  renderer-owned objects are not valid vNext document state;
- old live-stroke pixels are not a golden target when the canonical rich brush produces a
  higher-quality result;
- vNext does not keep duplicate writable code paths merely so old and new brush settings remain
  interchangeable; and
- old documents and browser environments are supported later through one-way importers, export
  bridges, and read-only receipt adapters. Those adapters cannot reintroduce legacy authority.

Storage durability is not deferred with that compatibility work. Canonical commands, RGBA16F tile
deltas, WAL records, OPFS checkpoints, and crash recovery are part of the new engine's correctness
and are developed in parallel with brush and filter quality.

Implementation reuse is encouraged even when compatibility is not. A previous-engine module or an
additional library may remain when it wins a named quality/performance corpus and is placed behind a
canonical provider boundary. Duplicate libraries are acceptable during the quality phase; brush
resampling, wet media, vector geometry, text shaping, filter kernels, codecs, and export may each
use a different best-in-class provider. What may not be reused is provider-owned document
authority, opaque serialization, or a lossy adapter that lowers the new engine to the old model.
Permissively licensed code can be integrated directly under its license; restricted or proprietary
implementations are treated only as behavioral references for an independent implementation.

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

vNext capabilities ship without a lower-tier equivalent. Retired renderers are outside the vNext
protocol and implementation scope. A feature can therefore require WebGPU, cross-origin isolation,
SharedArrayBuffer, Memory64, OPFS sync access, SIMD, threads, or a large specialist WASM engine when
that combination produces the best measured result.

## Current-to-target gap

| Capability | Current shipping path | Target authority |
| --- | --- | --- |
| UI and accessibility | React on the main thread | Keep |
| Pointer capture | DOM Pointer Events on the main thread | Keep; write normalized samples to SAB |
| Live rendering | Main-thread Canvas2D/WebGPU hybrid | Engine Worker + OffscreenCanvas |
| Document authority | `PageState[][]` + Konva scene | Versioned tile document in Engine Worker |
| Input transport | JS callbacks/owned arrays | SPSC SharedArrayBuffer ring; transferable batches are replay/test ingress only |
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
  WebGPU production authority
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
- A missing Memory64 capability fails closed for the vNext writable profile. Memory32 is permitted
  only inside bounded specialist kernels that never own document addressing.
- No feature may advertise “huge document support” merely because a Memory64 probe succeeds.
  The document is huge only after journal recovery, shard hydration, eviction, export, and undo
  pass end-to-end tests above 4 GiB logical offsets.

## Writable execution profile

`webgpu-worker-rgba16float-vnext` is the only profile accepted by protocol revision 2:

- Chromium secure context
- cross-origin isolation
- SharedArrayBuffer + Atomics
- OffscreenCanvas in a dedicated Worker
- Worker WebGPU
- Memory64 and WASM SIMD/threads where the selected kernel requires them
- OPFS `FileSystemSyncAccessHandle` in a dedicated Storage Worker

Capability admission is probe-based and immutable for an active document session. Missing
prerequisites reject the writable session before Worker construction. A WebGPU device failure
rebuilds the same vNext authority from the current accepted prefix and dirty-tile journal; it does
not silently demote the writable document to Canvas2D or WebGL2.

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
| Live raster ink and tile composition | ToonSpectrum raw WebGPU | CPU/Skia diagnostic oracle only | One worker-owned tile/frame authority |
| GPU effect prototypes and animated assets | PixiJS v8 WebGL | WebGPU only in an isolated experiment until its production gate passes | Emits textures/tile commands; never owns document history |
| High-quality vector/text rasterization and export oracle | CanvasKit/Skia WASM | software surface for deterministic export | Separate Quality/Export Worker consumes canonical paths/glyph runs |
| Editable Bézier/path geometry | `polygon-clipping`, `flatten-js`, `bezier-js`, Earcut | Paper.js only after a headless geometry PoC | Geometry Worker returns versioned paths/meshes; no Paper scene authority |
| Freehand outline seed | `perfect-freehand` | custom Rust/WASM fitter for long/high-quality strokes | Source samples stay canonical so the fitter is replaceable |
| Color parsing, conversion, gamut mapping, palette metrics | Color.js + Culori | independent conversion oracle and golden corpus | Plain scene-linear tuples only; no library color object crosses a Worker or document boundary |
| Image resampling and CPU analysis | pica + image-js | Rust/WASM SIMD or WebGPU compute after profiling | Bounded `ImageData`/typed arrays only; optional native Node canvas is disabled |
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

### Commercial-product behavior references

Commercial applications and restricted libraries are quality references, not code suppliers.
ToonSpectrum may reproduce a documented user-facing capability or independently derive an
algorithm from public standards and measured input/output behavior, but it must not translate,
rename, decompile, or paste proprietary implementation code. The result must use a ToonSpectrum
schema, ToonSpectrum tests, and a clean implementation history.

| Public behavior reference | Independently owned implementation status |
| --- | --- |
| [CLIP STUDIO PAINT brush customization](https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm) and documented input dynamics/start-end behavior | Versioned professional-dynamics plan, monotone response curves, accepted-sample timing, velocity smoothing, length/percentage taper, and deterministic deposition are implemented as provider-neutral code; live Studio authority integration remains gated. |
| [Adobe Photoshop textured and dual brushes](https://helpx.adobe.com/photoshop/using/creating-textured-brushes.html) | A content-addressed R8 texture-tip and document/stroke-grain plan, deterministic professional-dynamics lowering, zero-border bilinear sampling, and RGBA16F WebGPU specialist runtime are implemented and pass an independent CPU/actual-Chromium parity corpus. A separate deterministic R8 compiler covers baked two-tip affine masks and documented intersection/blend families. Dynamic second-tip spacing, scatter, and count remain an explicit runtime extension rather than being approximated by one tip; live authority routing remains gated on the provider actor. |
| [Adobe Photoshop Mixer Brush](https://helpx.adobe.com/photoshop/using/painting-mixer-brush.html) | A strict provider-neutral two-well state model now separates the loaded reservoir from canvas pickup, implements load/wet/mix/clean/reload behavior, uses optical-density pigment mixing, composes contact response without frame-rate-dependent reservoir depletion, and emits mass-conservation receipts. It is material-state groundwork, not yet a claim of live vNext pixel authority: canonical tile-field pickup/deposition and the GPU replay corpus remain release gates. |
| [Corel Painter spacing controls](https://product.corel.com/help/Painter/540235477/707000/EN/Doc/Spacing_Controls.html), [bristle controls](https://product.corel.com/help/Painter/540219480/Main/EN/Win-Documentation/Corel-Painter-Bristle-controls.html), and [rake controls](https://product.corel.com/help/Painter/540111155/Corel-Painter-en/Corel-Painter-Rake-controls.html) | Arc-length motion spacing and stationary time deposition are implemented in the professional plan. A separate clean-room bristle/rake contract implements density, fanning, contact angle, pressure/tilt spread, fixed or brush-relative feature scaling, turn displacement, outer-edge softening, deterministic per-bristle variation, and affine footprints. Its gamut-safe per-bristle color variation and RGBA16F analytic lowering are implemented; actual-browser parity and live authority routing remain release gates. RealBristle deformation and material pickup are not claimed. |
| [Corel Painter water controls](https://product.corel.com/help/Painter/540215550/Main/EN/Win-Documentation/Corel-Painter-Water-controls.html) and [paper interaction](https://product.corel.com/help/Painter/540215550/Main/EN/Win-Documentation/Corel-Painter-Watercolor-and-Paper-Texture.html) | The canonical recipe already versions fixed-rate pigment/water fields, absorption, bleed, drying, fixation, granulation, roughness, pigment load, water load, and wetness load. The new two-well model supplies deterministic brush-side mass exchange. Diffusion, capillary/grain flow, edge pooling, evaporation, and fixation still require an independently tested tile-field provider before they are marked implemented. |

The clean-room brush corpus is defined to cover the common professional behaviors publicly
documented by CLIP STUDIO PAINT, Photoshop, and Corel Painter. An item is implemented only after its
canonical contract, provider, independent oracle, and replay tests are all present; this list is the
acceptance scope rather than a claim that every item is already live:

- pressure, tilt, velocity, tangential pressure, twist, and deterministic random input curves for
  size, opacity, flow, spacing, roundness, angle, texture depth, and scatter;
- arc-length dab placement, minimum spacing, cubic path interpolation, optional post-correction,
  and explicit quality/performance budgets instead of frame-rate-dependent spacing;
- dual-tip masks, per-tip or document-space texture, depth/invert/blend controls, captured tips,
  rendered analytic tips, and deterministic spray counts;
- start/end dynamics by length or percentage, speed-sensitive taper, minimum one-pixel policy, and
  stationary continuous deposition for airbrush and wet-media tools;
- reference-mask anti-overflow, watercolor edge accumulation, pickup/reservoir color mixing,
  bristle/rake families, and fixed-step wet-media simulation; and
- real-time dab/stroke previews plus one-click preset reset without mutating the shipped default.

These are separate provider capabilities. A recipe may request several of them, but unsupported
combinations fail before the stroke starts instead of silently degrading to a round Canvas brush.
Every stochastic choice is seeded, every time-dependent effect uses accepted sample timestamps or a
fixed simulation clock, and live, committed, recovery, export, and collaboration paths consume the
same canonical recipe.

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
- Use CPU/Skia and independently specified color/filter mathematics as quality oracles. The current
  renderer is diagnostic evidence only and cannot define vNext output.

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
- Build these providers in parallel behind canonical plans, but do not make them production
  authority until tile commit, journal recovery, and device-loss gates pass.

## Non-negotiable release gates

1. No lost pointer boundary or accepted committed sample under ring overflow, tab suspension,
   worker restart, or device loss.
2. No predicted point in undo, persistence, export, or collaboration.
3. Pixel-difference budgets pass for every blend, eraser, mask, transform, filter, and export
   corpus against canonical CPU/Skia quality oracles; legacy Canvas output is not the target.
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
- The accepted authoritative sample stream must be bit-for-bit reproducible from its journal.
  Transferable replay/test ingress must reproduce the SAB-accepted prefix, but is not a live-input
  fallback. Predicted overlays may differ but must disappear on correction.
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

1. Move transient normal/erase ink to an OffscreenCanvas Engine Worker and connect the SAB ring.
   Unsupported hosts fail the vNext capability gate rather than receiving a writable WebGL2 path.
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

## Current implementation order

1. Keep the completed SAB input, versioned Worker protocol, canonical brush command, RGBA16F WebGPU
   dab runtime, authoritative tile model, and OPFS v2 journal/checkpoint contracts green.
2. Finish the canonical RGBA16F filter DAG, vector-ink geometry provider, CanvasKit Quality Worker,
   and color-quality provider as replaceable specialist engines.
3. Add a WebGPU dirty-tile readback provider that returns complete padded-row-safe RGBA16F tiles
   with device/request epochs, queue fences, cancellation, and bounded staging resources.
4. Connect canonical brush lowering, WebGPU execution, tile revisions, WAL records, commit markers,
   and exact acknowledgements inside the Engine/Storage Worker actor graph.
5. Replace the transient Canvas2D stroke path with the same canonical plan used for committed
   tiles; predicted samples remain presentation-only and are reconciled to the accepted prefix.
6. Expand the recipe and GPU providers with texture/dual tips, time deposition, wet media, smudge,
   pickup/reservoir mixing, and independently implemented professional dynamics.
7. Run real-device 120 Hz latency, browser WebGPU pixel parity, device-loss, torn-journal,
   multi-gigabyte logical-address, export, and collaboration replay gates before switching live
   document authority.

This ordering separates provider experimentation from durable ownership while still developing
quality, storage, and compatibility work in parallel. Every completed specialist remains
replaceable because the canonical command, tile, color, path, and journal schemas are ours.

## 개정 2026-09-02 (ADR-0021)

"A missing Memory64 capability fails closed for the vNext writable profile" 조항은
[ADR-0021](adr/0021-stroke-budget-myb-disposition-execution-profiles.md) §C로 개정됐다. 기본 프로필은
wasm32 + OPFS windowing이며, Memory64는 capability가 있고 4 GiB 논리 오프셋이 실제로 필요한 대형 문서에서만
켠다. 나머지 Memory64 정책(bigint 오프셋, bounded window, "huge document" 광고 금지)은 그대로다.
