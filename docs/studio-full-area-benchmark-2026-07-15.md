# Studio full-area competitor benchmark — 2026-07-15

> **2026-07-26 implementation re-audit:** this remains the historical scorecard for the 2026-07-15
> UI pass, but its current-status column has been reconciled against production code. The authority
> map for realtime CRDT and WebGPU is
> `docs/studio-crdt-webgpu-architecture-2026-07-16.md`; the broader shipped/backlog ledger is
> `docs/studio-competitor-features.md`. PSD boundaries remain documented in
> `docs/studio-psd-import-integration.md`, and 3D import history in
> `docs/studio-bg3d-custom-model-upload.md`. “Shipped vertical slice” below never means every legacy
> tool or scene type has migrated.

IA + visual + drawing interaction only. **No brand clones** and no direct parsing of closed native
project formats such as `.clip`, `.skp`, or `.blend`. Bounded Photoshop ABR import now ships; an ABR
marketplace does not.

Sources: public Magma help, CSP/Photopea/Canva/Krita/Procreate/Ibis/MediBang/Pixlr/Sketchbook/Concepts/Fresco/AutoDraw product docs & screenshots; prior `docs/studio-competitor-features.md`, `docs/studio-commercial-gap-close-2026-07-15.md`.

## Area matrix

| Area | Magma | CSP | Photopea | Canva/Express | Krita | Procreate | Ibis/MediBang | Pixlr/Sketchbook | Concepts | ToonSpectrum status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| App menubar | Top menus | Full | Classic | Minimal | — | — | — | Light | — | **shipped** body portal + File/Edit IA |
| Left tool rail | Yes | Yes | Dock | — | Docker | — | Side tools | Side | — | **shipped** Magma rail + glyphs |
| Tool options strip | Yes | Subtool | Options bar | Size chips | Tool Options | Slider HUD | Bottom/side | Compact | Metrics | **shipped** draw options + dual well + shape strip |
| Brush tray visuals | Tips | Subtool list | — | Named tools | Presets | Recent | Visual chips | — | — | **shipped** stroke-preview tiles |
| Dual color well | — | FG/BG+X | FG/BG | — | — | — | — | — | — | **shipped** |
| Symmetry | — | Mirror | — | — | — | Assist | — | — | — | **shipped** glyphs |
| Smart shape | — | Ruler-ish | — | AutoDraw-class | Assistants | — | — | — | Snap | **shipped** kind row |
| Bubble styles | — | Materials | — | Text styles | — | — | Balloons | — | — | **shipped** SVG swatches |
| Tone/screentone | — | Materials | Patterns | — | — | — | Tones | — | — | **shipped** premium swatches |
| Selection chrome | — | Options | Options | — | — | — | — | — | — | **shipped** badge cluster |
| Asset browser | — | Materials | Layers | Grid | — | — | Materials | Grid | — | **shipped** card + checkerboard |
| Layer list | — | Layers | Layers | — | Layers | Layers | Layers | Layers | — | **shipped** icon tiles |
| Status/HUD | Presence | Status | Info | — | Status | Gestures | — | Floating | Units | **shipped** tool metrics + stabilizer + pressure |
| Brush cursor | Dot | Size ring | Circle | — | Outline | Disc | Size | Circle | — | **shipped** fill+ring + soft glow |
| Shape picker | — | Tools | Shape | Shapes | Tools | — | — | Shapes | — | **shipped** visual grid + options strip + mobile |
| Density modes | Super Simple | Simple/Studio | — | — | — | — | — | — | — | **shipped** focus/simple/full |
| Stabilizer UI | — | Correction | — | — | Stabilizer | StreamLine | — | — | — | **shipped** options + HUD readout |
| Pressure HUD | — | Graph | — | — | — | Graph | — | — | — | **shipped** live meter + continuous gamma graph |
| Export/project | — | File | File | Download | — | Share | Export | Export | — | **shipped** portal panels |
| Collab presence | Core | Teamwork | — | — | — | — | — | — | — | **shipped vertical slice** vector CRDT + point comments + consented screen share; raster pilot partial |
| 3D / VRM | — | 3D | — | — | — | — | — | — | — | **shipped** poser/BG3D + GLB/glTF/OBJ/FBX/DAE/STL/PLY/3DS import; native SKP/BLEND absent |
| PSD smart objects | — | Partial | Strong | — | — | — | — | Partial | — | **partial** layered raster/masks + bounded one-way editable horizontal text export ship; editable import/smart objects absent |
| WebGPU / CRDT | — | Native | — | — | — | — | — | — | — | **shipped vertical slices** live/verified raster GPU + vector CRDT; full authority residual |

## Detail scores (visual / drawing UX, 1–5)

Scoring is **interaction craft** only — not full engine parity. 5 = commercial reference quality for web SPA; 3 = usable; 1 = missing.

| Detail area | Magma | CSP | Photopea | Canva | Krita | Procreate | Ibis | TS now | Gap notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tool identity strip | 4 | 5 | 4 | 3 | 5 | 4 | 4 | **5** | Mode chips + title/detail + shortcuts |
| Brush preview tiles | 3 | 5 | 2 | 4 | 4 | 5 | 5 | **5** | Stroke-preview tray shipped |
| Size / opacity readouts | 3 | 5 | 4 | 5 | 5 | 5 | 4 | **5** | Size chips + locks + dual well |
| Stabilizer discoverability | 2 | 5 | 2 | 1 | 5 | 5 | 3 | **5** | Slider + mode + HUD |
| Live pressure feedback | 2 | 4 | 2 | 1 | 3 | 5 | 3 | **4** | Live meter + graph + continuous gamma; no arbitrary multi-point curve |
| Brush cursor fidelity | 3 | 5 | 4 | 2 | 5 | 5 | 4 | **5** | Disc fill + ring + pen glow |
| Shape kind visuals | 2 | 4 | 5 | 5 | 3 | 2 | 3 | **5** | Grid + strip + filled preview |
| Smart-shape affordance | 1 | 3 | 2 | 5 | 3 | 2 | 2 | **4** | Kind row + HUD pill |
| Symmetry glyphs | 1 | 5 | 1 | 1 | 4 | 4 | 2 | **5** | Glyph strip on options |
| Dual color FG/BG | 2 | 5 | 5 | 2 | 4 | 3 | 3 | **5** | Well + swap |
| Status bar density | 4 | 4 | 4 | 2 | 5 | 3 | 3 | **5** | Tool · stab · pressure · symmetry · density |
| Mobile draw sheet | 3 | — | 2 | 4 | — | 5 | 5 | **5** | Shape grid + large sliders |
| Layer / asset chrome | 3 | 5 | 4 | 4 | 5 | 4 | 4 | **4** | Card + tiles (prior pass) |
| Selection chrome | 3 | 4 | 4 | 3 | 4 | 3 | 3 | **4** | Badge cluster prior pass |
| Collab live cursor | 5 | 3 | 1 | 1 | 1 | 1 | 1 | **3** | Cursor/comment/screen-share + vector CRDT ship; full raster-tool convergence remains |

## Drawing feature priorities (this pass)

1. Commercial **brush cursor** (size disc + soft fill + pen glow) — CSP/Procreate  
2. **HUD** tool metrics (brush, stabilizer, symmetry, pressure curve, live pressure, shape fill) — Concepts/Krita  
3. **Shape kind visual picker** everywhere: inspector grid, options strip, advanced dropdown, mobile sheet — Photopea/Canva  
4. Draw-options **pen / eraser / shape** mode switch + fill toggle on strip  
5. Keep DESIGN.md warm-ink + accent-only active signals (`text-on-accent`, no `text-white` on accent)

## Shipped surface map (code)

| Surface | Module / hook |
| --- | --- |
| Shape glyphs / grid / strip / pressure meter | `studio-creative-visuals.tsx` |
| HUD pure labels | `studio-draw-hud.ts` |
| Draw options strip | `StudioDrawOptionsBar.tsx` |
| Stage brush cursor + status bar + shape UIs | `StudioPage.tsx` |
| Brush tray previews | `StudioBrushTray.tsx` (prior) |
| Dual color well / HUD pill chrome | `studio-chrome-ui.tsx` (prior) |

## Explicit remaining boundaries

- Full CSP EX / Photoshop feature parity and direct `.clip` parsing.
- ABR marketplace and Firefly OAuth. ABR **file import** itself is shipped.
- Magma-class raster parity across erase, fill, selection, filter, transform, merge, and flatten;
  trusted raster-log compaction; and work-scoped remote image/VRM/3D hydration. Vector/stylus CRDT,
  durable server updates, point comments, presence, and consented screen sharing are already shipped.
- Full committed WebGPU ownership of images, text, bubbles, filters, selection, 3D, readback/export,
  and the top interaction plane. Live ink and a verified raster-presentation slice already ship with
  Canvas2D/Konva fail-closed fallback.
- Arbitrary multi-point pressure transfer curves. The live meter and continuous gamma graph ship.
- Native `.skp`/`.blend` import and Blender-class mesh/UV/sculpt/modifier authoring.

## Acceptance for this visual/drawing pass

- [x] Multi-area matrix + detail score table  
- [x] Brush cursor commercial disc  
- [x] Status HUD: tool / stabilizer / pressure curve / live pressure / shape fill / symmetry  
- [x] Shape visual picker on desktop inspector, options strip, advanced strip, mobile sheet  
- [x] Vitest: `studio-draw-hud`, `studio-creative-visuals`  
- [x] DESIGN tokens respected (on-accent, warm-ink)  
