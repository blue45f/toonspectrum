# ToonStudio shared drawing quality completion — 2026-09-18

## Scope

This pass treats drawing as one product capability owned by the canonical Studio runtime.
`drawingShell=integrated` and `drawingShell=app` are presentations of the same document,
input, brush, layer, history, save, collaboration and interchange authorities. No capability in
this report is implemented as a second `/draw-app` editor engine.

The repository already contained substantial professional drawing infrastructure. The goal of this
pass was therefore not to duplicate it, but to close the remaining software gaps and make the
existing quality work one executable regression contract.

## Newly completed product work

### 1. Artist-authored drawing-input profiles

The Drawing Input Center already exposed device telemetry and built-in task presets. It now also
supports a bounded library of artist-authored profiles:

- save the current stabilizer mode/strength, post-correction, pressure response and minimum-size
  input feel under an artist-defined name;
- update a profile by saving the same name again;
- apply a saved profile without changing brush identity, color, artwork or project state;
- delete saved profiles independently of documents;
- persist through the canonical Studio SQLite/OPFS database adapter instead of localStorage;
- re-read under a Web Lock before mutation so sequential multi-tab writes do not overwrite a
  stale in-memory snapshot;
- fail closed to an empty library if the persisted envelope is malformed;
- cap the library at 12 profiles and bound profile/name payloads.

The profile launcher lives beside the existing Drawing Input Center and is lazy-loaded. The two
surfaces are mutually exclusive, preserve focus-return behavior, and keep practical touch targets.

### 2. Live stylus sensor cursor ghost

The exact configured brush footprint ring remains unchanged and authoritative for brush size. A
second, non-document sensor ghost now communicates live stylus telemetry:

- hover is visible at nominal footprint size even though Pointer Events pressure is zero;
- contact pressure scales the ghost inside, never outside, the exact configured brush ring;
- tilt or altitude compresses the minor axis;
- azimuth plus barrel twist rotates the ghost;
- malformed sensor values are sanitized into finite bounded transforms;
- mouse/touch never receive the pen-only ghost;
- updates are passive and requestAnimationFrame-batched;
- the ghost lives on the cursor UI canvas and never enters document, history, collaboration,
  export or committed renderer state.

The feature follows the existing brush-cursor visibility preference, so artists who disable the
brush cursor do not get a new forced overlay.

### 3. Bounded native prediction horizon

Native `getPredictedEvents()` input is disposable latency UI, not drawing authority. The ingest
adapter now caps one native prediction delivery to the nearest 24 predicted samples. This protects
against embedded browsers/polyfills returning an unexpectedly large future list while preserving:

- every `pointerrawupdate` sample;
- every coalesced authoritative sample;
- processed pointer ordering/promotion;
- the separate replaceable predicted-ink surface;
- the rule that predictions never commit to document/history/CRDT authority.

Tests explicitly prove that an authoritative coalesced batch larger than the prediction limit is
not truncated.

## Existing professional systems retained and certified

These systems were already implemented and are now grouped into the executable
`drawing-engine-integrity` operational lane rather than being reimplemented:

### Input, latency and stroke quality

- pointerrawupdate + coalesced-event ingestion and promotion;
- native and internal prediction with prediction/authority separation;
- standard, adaptive and precision stabilizer modes;
- endpoint flushing so strong stabilization does not shorten the saved stroke;
- pressure curves, device pressure calibration, velocity response and pen-button/eraser-tip routing;
- bounded raw-pen preview and high-density stylus channels.

### Brush preview/commit quality

- shared material/dynamic brush programs for live and committed rendering;
- exact or bounded parity contracts already exercised by brush/material suites;
- bounded retained brush coverage and cache ownership instead of one unbounded canvas-sized
  offscreen surface.

### Large-canvas and memory behavior

- 256-pixel world-aligned brush coverage tiles;
- per-stroke admission budgets;
- bounded committed LRU cache;
- lower cache budget on coarse-pointer or <=4 GiB device-memory profiles;
- active drafts excluded from retained cache population.

### Layers, compositing and selection

- blend/isolated-source and eraser compositing contracts;
- mask/adjustment rendering behavior;
- deterministic selection-boundary smoothing with area/centroid restoration;
- selection metadata, point count and brush-selection radius preservation.

### PSD, CLIP and workspace interchange

The existing round-trip lane remains authoritative for:

- PSD import;
- editable PSD text export and visible raster fallback for unsupported structures;
- adjustment graph export;
- CLIP selection round-trip;
- workspace interchange.

Lossy/unsupported interchange remains explicit rather than being silently coerced.

## Automated operational contract

`docs/benchmarks/studio-operational-validation-certification.json` now includes a dedicated
`drawing-engine-integrity` lane. The existing verifier executes the listed Vitest files, so the
manifest is not merely documentation.

The lane covers:

- integrated/app presentation identity;
- Drawing Input Center preset behavior;
- custom profile persistence;
- stylus sensor-ghost planning;
- brush pressure dynamics;
- stabilizer behavior and endpoint completion;
- low-latency ingest behavior and prediction budget;
- predicted-tail authority separation;
- dynamic brush coverage/memory contracts;
- selection refinement;
- live adjustment/compositing semantics.

The existing file-roundtrip lane remains alongside it for PSD/CLIP/workspace fidelity.

## What remains an external release gate

No deterministic unit/integration test can truthfully replace physical acceptance. The operational
manifest therefore continues to block claims of real-hardware/browser certification and
professional replacement until external release gates are run. In particular:

- current-commit eight-hour soak on the release build;
- physical pen-display/tablet sessions for pressure, tilt, hover, barrel rotation, stylus buttons
  and palm rejection;
- real WebGPU device-loss/browser worker-termination runs;
- Safari/Chromium/Firefox process-crash + OPFS recovery runs;
- real multi-client network/Socket.IO/PostgreSQL partition recovery;
- screen-reader, keyboard-only and 200% zoom physical-device acceptance;
- signed professional creator evaluation.

Keeping these unresolved is intentional: this PR completes the software implementation and
executable regression contracts without manufacturing evidence for hardware that CI does not own.
