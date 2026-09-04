# ToonSpectrum Studio 3D production multipass — wave 2

Date: 2026-09-04

## Problem closed in this wave

The 3D Pro Suite exposed an advanced multipass planner, but its primary action had no production callback when opened inside the actual background editor. The real shot-batch controls lived separately in the Camera tab. This created two misleading experiences:

- a visually rich Pro Suite panel that could be non-operational in production;
- a real exporter whose shot selection, recovery state, PSD fallback and contact-sheet options were invisible from the Pro Suite workflow.

Wave 2 connects those surfaces without creating another store or a second archive implementation.

## Production bridge

`StudioBg3dProSuiteRuntimeValue.productionBatch` now projects the existing canonical editor state as commands:

- selected saved-shot IDs;
- actual production pass catalog and labels;
- output-height policy;
- layered PSD and contact-sheet flags;
- recovery readiness, block reason, progress and recovery summary;
- atomic shot/pass selection commands;
- the existing `exportSavedShotsAsZip` entry point.

The bridge validates shot IDs, pass IDs and allowed export heights before updating editor state. It never exposes the mutable editor Sets directly.

`StudioBg3dMultiPassExporterPanel` selects one of two truthful modes:

1. **Production mode** inside the editor, backed by the real recovery/LT/PNG/PSD/archive pipeline.
2. **Standalone planning mode** when an explicit callback is supplied, retained for stories, tests and embedding.

An editor capture lock always wins over an explicit `disabled={false}` value.

## Production presets

The real seven-pass batch catalog is grouped into task presets:

- **Review**: beauty + LT composite
- **Manuscript**: LT composite + color + tone + texture line + main line
- **AI reference**: beauty + main line + depth
- **All**: every currently verified batch output

Preset detection compares sets rather than array order. A manually edited selection is labeled `custom` and is never falsely presented as the all-pass preset.

## Visible package planning

Before allocating image buffers, the UI computes:

- PNG count = selected shots × selected passes;
- PSD count;
- contact-sheet count at 12 shots per page;
- manifest-inclusive total file count;
- warnings for large sequential PNG batches and high PSD pressure.

This mirrors the batch pipeline’s existing bounded, sequential execution model without claiming exact compressed byte size before capture.

## Capture-v2 rasterization foundation

`studio-bg3d-artifact-rasterization.ts` converts validated renderer-neutral capture artifacts into independent, PNG-ready RGBA arrays:

- beauty: copied straight-alpha sRGB;
- depth: near-black to far-white grayscale;
- normal: octahedral RG8 decoded to view-space RGB normal;
- object/material ID: deterministic collision-free visible palette plus stable-ID legend;
- shadow/AO: white-to-black multiply masks;
- emission: linear RGB converted to sRGB while preserving alpha;
- velocity: signed XY and magnitude visualization with explicit pixels-per-second scale.

The conversion is DOM-free, renderer-free and snapshots the validated capture before returning arrays. It does not mutate capture-owned buffers.

## Capability boundary

The production selector continues to advertise only outputs that already pass the shot-batch recovery, manifest, PNG/PSD and archive integrity gates:

- beauty
- LT composite
- color
- tone
- texture line
- main line
- depth

Capture-v2-only artifacts remain visible as integration status, not enabled checkboxes:

- normal
- object ID
- material ID
- direct shadow
- ambient occlusion
- emission
- velocity

The new rasterization layer removes one prerequisite for promoting those outputs, but promotion still requires per-renderer capture proof, recovery serialization, public manifest profiles, archive verification and PSD semantics.

## Tests added

- `studio-bg3d-production-multipass.test.ts`
- `StudioBg3dProductionMultiPassExporterPanel.test.tsx`
- expanded `StudioBg3dProSuiteRuntimeBridge.test.tsx`
- `studio-bg3d-artifact-rasterization.test.ts`

They cover task presets, custom selection detection, package counts, production command routing, capture locks, block/progress/recovery UX, deferred capability disclosure, deterministic artifact conversion and fail-closed malformed input handling.
