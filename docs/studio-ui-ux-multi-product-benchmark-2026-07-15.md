# Studio UI/UX multi-product benchmark — 2026-07-15

IA and interaction patterns only — **no brand clones**, no proprietary asset formats.

## Product set

| Product | Class | UI/UX takeaways for ToonSpectrum |
| --- | --- | --- |
| **Magma** | Browser collab draw | Top app menu + left tool rail + Super Simple/Full density; hover-switch menus; presence HUD |
| **Clip Studio Paint** | Pro comic/webtoon | Dual color well + X swap; tool options strip; subtool tray; page/export-centric file IA |
| **Photopea** | Browser PS-class | Classic menubar File/Edit/View; FG/BG wells; dense but scannable options |
| **Canva / Express** | Consumer design | One-tap size chips; clear primary CTA; low-chrome “finish” paths |
| **Krita** | Desktop paint | Tool Options docker; always-visible tool identity; vertical tool column |
| **Pixlr** | Web photo/draw | Compact tool identity + color strip; glass floating chrome |
| **Procreate** | iPad paint | Size/opacity lock; recent brushes; gesture-first canvas max |
| **ibisPaint** | Mobile manga | Favorites + recent brushes; dense bottom/side tool access |
| **MediBang** | Comic web/mobile | Clear pen/eraser mode; material panels without marketing chrome |
| **Sketchbook** | Paint | Clean canvas focus; minimal floating HUD |
| **Concepts** | Infinite canvas | Metric HUD pills (zoom/units); precision readout |
| **Adobe Fresco** | Hybrid paint | Soft glass panels; tool groups with gentle elevation |
| **AutoDraw** | Assistive | High-affordance mode toggles (AI assist as optional, not default clutter) |
| **Sumo Paint** | Browser classic | Full menubar discoverability over icon-only mystery meat |
| **Affinity / PS** | Pro edit | Select All / Deselect hygiene; zoom 100% / fit |

## Design system constraints (DESIGN.md)

- Warm-ink OKLCH surfaces; persimmon accent for **active/primary only**
- Canvas is hero; chrome stays dense and flush
- Motion 150–250ms ease-out-expo; no page-load choreography
- 44px touch targets on coarse pointers

## Shipped this pass (mapped)

| Pattern | Source class | Implementation |
| --- | --- | --- |
| Dual FG/BG color well + swap | CSP / Photopea | `StudioDualColorWell` on draw options |
| Tool options cluster surface | Krita / Fresco | `.studio-opt-cluster` glass pill |
| HUD metric pills | Concepts / Sketchbook | Status bar + `StudioHudPill` CSS |
| Rail active spine + hover | Magma / Ibis | Existing rail + refined hover lift |
| Menubar glass hierarchy | Magma / Sumo | Menubar gradient + title weight |
| Shortcut kbd chips | Photopea / CSP | `StudioKbdBadge` + menu shortcuts |
| Size chips + locks | Canva / Procreate | Existing chips + locks (prior) |
| Body menus / no clip | Magma / Sumo | Portal menus (prior) |

## Creative feature visuals (shipped 2026-07-15 pass 2)

| Feature | Competitor cue | Implementation |
| --- | --- | --- |
| Brush tray tiles | Picsart / Ibis / CSP subtool | SVG stroke previews per media family + paper tooth (`studio-brush-visual`, `StudioBrushTray`) |
| Preview styles | Express media chips | solid / soft / dashed / dots / wavy / calligraphy / neon / texture / tone |
| Size readout | Procreate / CSP | Soft halo tip preview on options bar |
| Bubble styles | Clip Studio / Canva text styles | Mini speech SVG swatches (`StudioBubbleStylePresetPanel`) |

## Explicit non-goals

1:1 visual skins; CSP assets marketplace; ABR; native companion hardware skins; Firefly branding.
