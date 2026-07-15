# Studio commercial gap-close (finite batch) — 2026-07-15

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
| 12 | Full CSP EX / PS / Magma realtime / WebGPU / ABR marketplace / CRDT | (industry residual) | **deferred** | Needs native assets, OAuth, server CRDT, or multi-year engine rewrite — see Non-goals |

## Deferred (same artifact, out of this finite close)

- AI semantic auto-color / scribble hints — model + pipeline
- Always-on live room outside team panel + full CRDT ops — server product
- WebGPU renderer rewrite — architecture non-goal
- ABR tip marketplace — proprietary format non-goal
- Photopea-complete smart objects / editable text PSD round-trip — partial PSD remains

## Acceptance mapping

- AC1: this table (12 rows).
- AC2: closed rows are in UI/logic; #12 deferred with reason.
- AC3–4: chrome portal + pointer unit tests.
- AC5: Vitest + scratch logs under implementer scratch.

## Follow-on UI/UX polish (2026-07-15 multi-product)

See `docs/studio-ui-ux-multi-product-benchmark-2026-07-15.md` for Magma/CSP/Photopea/Canva/Krita/Pixlr/Procreate/ibis/MediBang/Sketchbook/Concepts/Fresco/AutoDraw/Sumo/Affinity mapping.

Shipped in same session:

- `StudioDualColorWell` (CSP/Photopea FG·BG + swap) on draw options
- `StudioKbdBadge` shared shortcut chip
- Options-cluster glass, dual-well surface, HUD pill base styles
- Rail hover/active shadow refinement
