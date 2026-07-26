# Studio commercial gap-close (finite batch) — 2026-07-15

> **2026-07-26 implementation re-audit:** the original #12 blanket deferral is not the current
> product status. Realtime vector/stylus CRDT, durable server updates, point comments, consented
> screen sharing, WebGPU live ink, and a verified raster-presentation pilot ship as bounded vertical
> slices. See `docs/studio-crdt-webgpu-architecture-2026-07-16.md` for exact authority and residuals,
> `docs/studio-competitor-features.md` for the wider shipped ledger,
> `docs/studio-psd-import-integration.md` for PSD loss boundaries, and
> `docs/studio-bg3d-custom-model-upload.md` for the original 3D import integration.

Goal: close a **finite, benchmark-backed** set of Studio gaps for Magma/CSP/Photopea/Canva/Krita/Pixlr/ibis-class **IA** (not brand clones). Unbounded “parity with every install product” is **out of contract**.

Sources: `docs/studio-web-drawing-benchmark-2026-07-12.md`, `docs/studio-capability-audit-2026-07-12.md`, `docs/studio-competitor-features.md`, recent Studio chrome/menu/pointer work.

## Gap set (≤12)

| # | Gap | Competitor class | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Body-portaled File/Edit/… application menus (visible under options strip) | tool chrome / menu discoverability | **closed** | `StudioMainMenu` → `createPortal(document.body)`, z workspace |
| 2 | Export + project panels not clipped by menubar `overflow-x-auto` | menu/export discoverability | **closed** | fixed + body portal; `data-studio-export-menu-panel` / `data-studio-project-actions-menu` |
| 3 | Desktop tools discoverable via main menu + left rail (toolbelt may be off-screen) | tool chrome | **closed** | Magma-style groups 파일/편집/삽입/보기/그리기/AI; rail tools |
| 4 | Mouse stroke ends when left button released mid-drag / leave | drawing input | **closed** | `shouldEndStudioStrokeForReleasedContact` + left-contact begin |
| 5 | Magma-style menubar: open one group → hover switches siblings | tool chrome | **closed** | `barActive` + `onMouseEnter` in `StudioMainMenu` |
| 6 | Pro draw prefs: size/opacity lock, recent brushes, CSP-ish shortcuts | drawing input | **closed** | `studio-pro-draw-prefs`, `studio-drawing-shortcuts` |
| 7 | Commercial multi-app chrome polish (options identity, density focus/full) | density/mobile canvas-first | **closed** | `StudioDrawOptionsBar`, density menu items, focus layout |
| 8 | Edit menu: copy / duplicate / delete / eyedropper | tool chrome | **closed** | wired in `studioMainMenuGroups` |
| 9 | Edit: select-all + deselect (Photopea/CSP selection hygiene) | tool chrome | **closed** | this batch |
| 10 | View: zoom in / out / 100% (Magma/Krita view IA) | tool chrome | **closed** | this batch |
| 11 | Application menus visible from tablet widths (md+, not only lg) | density/mobile canvas-first | **closed** | this batch — `md:flex` main menu |
| 12 | Full CSP EX / PS / Magma raster parity / full WebGPU authority / ABR marketplace | (industry residual) | **bounded slices shipped; residual deferred** | Vector CRDT, server durability, screen share, WebGPU live ink, ABR import, layered PSD, and broad 3D interchange ship; exact residuals below |

## Re-audited residuals (outside this finite close)

- **Semantic AI colorization remains.** Local connected-region scribble hints, palette validation,
  Worker planning, and selected/new paint-layer application ship in
  `studio-auto-color-hints.ts` / `StudioAutoColorHintsPanel.tsx`; they intentionally do not infer
  subject semantics, artist style, lighting, or shading.
- **Magma-class raster completeness remains.** Vector/stylus scene operations and the immutable
  semantic raster protocol ship, but only exact round opaque pen strokes are product-published.
  Erase/fill/selection/filter/transform/merge/flatten wiring, trusted checkpoint compaction, and
  remote asset hydration remain. Deployment boundaries include the process-local default adapter,
  no durable Vercel-serverless WebSocket claim, process-local backlog admission, and no
  transactional lock-fanout outbox.
- **Full WebGPU renderer authority remains an architecture non-goal without a measured driver.**
  Live pressure-aware normal/erase dabs and the verified idle/select-only raster slice ship;
  Konva remains authority for unsupported scene/interactions/readback.
- **ABR tip marketplace remains a product/rights/commerce non-goal.** Bounded ABR v6/7/9/10 import,
  tip conversion, dynamics approximation, and one-shot Worker execution already ship.
- **Photopea-complete smart objects / editable text PSD round-trip remains.** Layered raster
  import/export and editable raster masks ship. A bounded one-way export slice now writes editable
  PSD descriptors for supported horizontal, solid-color text while retaining its raster preview;
  rotated/vertical/path/effect text falls back with explicit diagnostics. Editable text import,
  adjustment layers, layer effects, smart objects, and isolated group blending remain lossy or
  unsupported.
- **Native `.skp` / `.blend` and full Blender-class authoring remain.** The browser importer now
  accepts GLB, glTF, OBJ, FBX, DAE, STL, PLY, and 3DS and canonicalizes them to self-contained GLB.

## Acceptance mapping

- AC1: this table (12 rows).
- AC2: closed rows are in UI/logic; #12 distinguishes shipped vertical slices from explicit residuals.
- AC3–4: chrome portal + pointer unit tests.
- AC5: Vitest + scratch logs under implementer scratch.

## Follow-on UI/UX polish (2026-07-15 multi-product)

See `docs/studio-ui-ux-multi-product-benchmark-2026-07-15.md` for Magma/CSP/Photopea/Canva/Krita/Pixlr/Procreate/ibis/MediBang/Sketchbook/Concepts/Fresco/AutoDraw/Sumo/Affinity mapping.

Shipped in same session:

- `StudioDualColorWell` (CSP/Photopea FG·BG + swap) on draw options
- `StudioKbdBadge` shared shortcut chip
- Options-cluster glass, dual-well surface, HUD pill base styles
- Rail hover/active shadow refinement
