# Competitor residual batch — 2026-07-24

Finite shippable batch after CSP EX / Magma / Photopea / Procreate / SHAPER survey.
**Not** infinite competitor parity (ABR marketplace, full pixel CRDT, WebGPU canvas rewrite, Firefly, Drive OAuth, vector LT, BVH auto-rig remain industry deferred).

## Shipped this batch

| Competitor class | ToonSpectrum delivery |
| --- | --- |
| CSP EX multi-page multi-select move/delete | `deletePagesBulk` / `movePagesBulk` + `StudioPageListPane` multi-select toolbar |
| CSP EX lettering 루비 + range format | `studio-dialogue-ruby.ts` + story panel 루비 UI |
| CSP EX pure ruby glyph-run layout | `studio-dialogue-ruby-layout.ts` (`planDialogueRubyRuns` + overlay placements) + Vitest |
| Konva horizontal ruby paint (MVP) | `StudioKonvaTextNodes` / `StudioKonvaBubbleNode` stacked overlays; vertical/path skipped |
| Marquee multi-select lettering format | `selectedIds` → story batch 「선택만」 (`marqueeIds` glue on `StudioPage`) |
| Export package DPI / trim / bleed editors | Presets + editable geometry in `StudioExportMenuPanel`; pure `studio-export-package-preflight` |
| Export page-range multi-page capture | CBZ/PDF/contact/preset honor package range via `planMultiPageExportCapture` (indices prop or all-then-slice) |
| Shortcut conflict UX + remap-aware drawing | `listStudioShortcutConflicts`, registry-aware `resolveStudioDrawingShortcut`, settings badges, help remaps |
| Multi-object surface snap product path | `planStudioBg3dMultiSurfaceSnap` + multi pick (cap 64), one history step |
| Multi-object placement recipe | `placeSelectedModelRecipe` multi custom models (cap 64), “N개 배치를 정리했어요” |
| BG3D/VRM insert transparent subject | insert background mode pure + UI checkboxes |
| Generic 3D workflow metadata | attach/parse + models-tab classification UI |
| Pose material blend strength | strength slider + `blendStudioPoseMaterialMergePlan` |
| Anim named clip rename / ease set | `renameTimelineClip`, extended ease on timeline panel |
| Live soft-lock canvas mutation gate | `studio-live-canvas-mutation-gate` + integration boundary |
| Auto-color hints panel (plan-only) | `StudioAutoColorHintsPanel` on inspector fill tab; demo fixture; plan copy; no silent pixel overwrite |
| Edit crop menu reachability | crop gated correctly in edit controls + menubar |

## Still deferred (honest multi-hour / industry)

| Item | Why deferred |
| --- | --- |
| Frame-folder topology / shared gutters | Separate document engine (M–L) |
| Full rich-text / measureText-accurate ruby / vertical 傍点 | Horizontal MVP shipped; multi-line wrap, middle verticalAlign, SVG export, true measureText still approximate |
| SHAPER texture paint on mesh UI | Pure paint stack exists; poser surface not mounted (multi-hour runtime) |
| Auto-color scribble + selection-pixel apply | Panel + pure planner shipped; scribble brush tool, selected-layer ImageData wiring, Advanced Fill apply batch not glued (no silent overwrite) |
| Full Magma CRDT / WebGPU scene authority | Architecture multi-year |
| ABR marketplace, cs3* formats | Policy exclusion |
| Workspace cloud sync / shortcut marketplace | Local chrome workspaces + settings registry are product-complete; cloud deferred |

## Stop condition

Finite high-ROI shippable rows for this batch are closed. Remaining items are multi-hour poser runtime, multi-year architecture, or policy exclusions — not open “in progress” glue.

## Verification

- Targeted Vitest residual suites + `tsc --noEmit` after landings (evidence under goal scratch when run in goal harness).
- Static reachability: export geometry testids, auto-color lazy/inspector mount, Konva ruby layout imports, multi placement recipe path.
