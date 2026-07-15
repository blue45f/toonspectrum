# Studio commercial residual closeout — 2026-07-15 (evening)

> **2026-07-16 engine update:** G9b and G10b now have production vertical slices rather than being
> blanket-deferred. See `docs/studio-crdt-webgpu-architecture-2026-07-16.md` for the exact authority
> boundary, fail-closed behavior, and remaining raster/scene migration work.

Finite competitor **기능 · 디자인 · UI/UX** residual batch after full-area visual + icon-first passes.  
**No brand clones**, no ABR/cs3*, no unbounded “until parity with every install product.”

Sources: `docs/studio-full-area-benchmark-2026-07-15.md`, `docs/studio-ui-ux-multi-product-benchmark-2026-07-15.md`, `docs/studio-commercial-gap-close-2026-07-15.md`, Magma/CSP/Photopea/Canva/Krita/Procreate/Ibis public IA.

## Multi-product area matrix (refresh)

| Area | Magma | CSP | Photopea | Canva | Krita | Procreate | Ibis | TS status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Menubar / portal menus | Core | Full | Classic | Light | — | — | — | **shipped** |
| Tool rail + options strip | Core | Subtool | Options | Chips | Docker | HUD | Side | **shipped** |
| Brush tray / dual well / symmetry | — | Strong | FG/BG | — | Strong | Recent | Tips | **shipped** |
| Shape pickers + smart shape | — | Ruler | Shapes | AutoDraw | Assist | — | — | **shipped** (+ residual G1) |
| Selection context chrome | — | Options | Options | — | — | — | — | **shipped** (+ residual G2) |
| Layer / asset cards | Materials | Layers | Grid | Grid | Layers | Layers | Materials | **shipped** (+ residual G3) |
| Status HUD / pressure / density | Presence | Status | Info | — | Status | Gestures | — | **shipped** |
| Live presence dock / cursors | Core | Team | — | — | — | — | — | **partial** product UI (+ residual G4); **not** full Magma CRDT |
| PSD smart objects / WebGPU / ABR / CRDT rooms | — | Partial | Strong | — | Native | — | — | **deferred** industry |

## Finite gap set (≤10 shippable residuals)

| # | Gap | Competitor class | Status | Product evidence |
| --- | --- | --- | --- | --- |
| G1 | Smart-shape match cue: recognized kind glyph highlight + icon-first toggle | AutoDraw / Canva assist | **closed** | `StudioQuickShapePanel`, `StudioSmartShapeKindRow` `highlightKind`, `studioSmartShapeMatchToGlyph` |
| G2 | Selection options strip icon-first (actions + badge) | PS Mobile / CSP / Magma context bar | **closed** | `StudioSelectOptionsBar` `data-studio-icon-first`, `studioSelectionBadgeText` |
| G3 | Asset favorite filter icon-only (no “즐겨찾기만” text chip) | Canva / Ibis materials density | **closed** | `StudioRasterAssetGrid` favorite toggle `aria-label` only |
| G4 | Live presence dock commercial stack (avatar stack, link pill, overflow helpers) | Magma presence strip | **closed** | `StudioLivePresenceDock` `data-studio-presence-dock`, `studio-commercial-residuals` presence helpers |
| G5 | Smart-shape Korean label → glyph pure map (unit-tested) | AutoDraw recognition HUD | **closed** | `studio-commercial-residuals.ts` + Vitest |
| G6 | Selection multi-count chip pure formatter | Magma multi-select badge | **closed** | `studioSelectionCountChip` + SelectOptionsBar |
| G7 | Presence overflow / visible peer cap pure helpers | Magma avatar overflow | **closed** | `studioPresenceOverflowLabel`, `studioPresenceVisiblePeerCount` |
| G8 | Toggle chip a11y label prop for icon-only toggles | CSP tool options a11y | **closed** | `StudioToggleChip` `aria-label` |
| G9a | Magma **always-on presence chrome** (dock while connecting/ready, even zero peers) | Magma presence strip | **closed** | `studioLivePresenceAlwaysVisible`, `StudioLivePresenceDockConnected` alwaysOn — **not** CRDT ops |
| G9b | Full Magma CRDT realtime ops / always-on multiplayer document merge | Magma product backend | **deferred** | Requires server CRDT + conflict model; transport presence already ships |
| G10a | CSP/Procreate-class **pressure response graph editor** (transfer curve SVG + continuous γ) | Procreate / CSP pressure curve | **closed** | `studio-pressure-curve-graph.ts`, `StudioPressureCurveGraph` in `StudioBrushInputControls` |
| G10b | WebGPU canvas rewrite | Engine | **deferred** | Architecture multi-year |
| G10c | ABR tip marketplace | Proprietary format | **deferred** | Policy: no ABR/cs3* marketplace |
| G10d | Photopea-complete smart objects / editable text PSD round-trip | PSD engine | **deferred** | Partial raster PSD import/export already ships; smart-object graph not in scope |

## Saturation closeout

**Implementable slices of former “deferred” rows are closed (G9a, G10a).** Remaining open work is **only true industry/engine residuals**: full CRDT document merge (G9b), WebGPU rewrite (G10b), ABR marketplace (G10c), Photopea-complete smart objects (G10d). Shippable Magma/CSP/Procreate **presence chrome + pressure graph** are product code, not deferred theater.

## DESIGN constraints held

- Warm-ink surfaces; peer presence initials use cream `oklch` ink (not raw `#fff` on accent tokens).
- Accent active signals use `text-on-accent` where accent fill is the product accent.
- Heavy shape glyphs remain lazy-loaded from StudioPage static graph (prior budget pass).

## Verification mapping

| AC | Evidence |
| --- | --- |
| Matrix + shipped/partial/deferred | this doc tables |
| ≤10 gaps; closed in product | G1–G8 closed rows + paths above |
| Saturation sentence | § Saturation closeout |
| Vitest pure helpers | `studio-commercial-residuals.test.ts`, select/creative/live tests |
| Bundle budget | `check-studio-bundle` after build |
