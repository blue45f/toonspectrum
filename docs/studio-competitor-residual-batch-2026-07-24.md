# Competitor residual batch — 2026-07-24

Finite shippable batch after CSP EX / Magma / Photopea / Procreate / SHAPER survey.
**Not** infinite competitor parity (ABR marketplace, full pixel CRDT, WebGPU canvas rewrite, Firefly, Drive OAuth, vector LT, BVH auto-rig remain industry deferred).

## Shipped this batch

| Competitor class | ToonSpectrum delivery |
| --- | --- |
| CSP EX multi-page multi-select move/delete | `deletePagesBulk` / `movePagesBulk` + `StudioPageListPane` multi-select toolbar |
| CSP EX lettering 루비 + range format | `studio-dialogue-ruby.ts` + story panel 루비 UI |
| CSP EX pure ruby glyph-run layout | `studio-dialogue-ruby-layout.ts` (`planDialogueRubyRuns` + overlay placements) |
| Konva horizontal ruby paint (MVP) | `StudioKonvaTextNodes` / `StudioKonvaBubbleNode` stacked overlays; vertical/path skipped |
| Marquee multi-select lettering format | `selectedIds` → story batch 「선택만」 (`marqueeIds` glue) |
| Export package DPI / trim / bleed editors | Presets + editable geometry in `StudioExportMenuPanel` |
| Export page-range multi-page capture | `planMultiPageExportCapture` + **parent `capturePagesForIndices`** wired via StudioPage → menubar → export panel |
| Dialogue package TXT with ruby preview | `planStudioExportDialogueTxt` emits `漢字(かんじ)` via `formatDialogueTextWithRubyPreview` |
| Shortcut conflict UX + remap-aware drawing | `listStudioShortcutConflicts`, registry-aware drawing resolver, settings badges, help remaps |
| Multi-object surface snap / placement recipe | multi pick (cap 64), one history step |
| BG3D/VRM insert transparent subject | insert background mode pure + UI |
| Generic 3D workflow metadata | models-tab classification UI |
| Pose material blend strength | strength slider + blend plan |
| Anim named clip rename / ease set | timeline panel |
| Live soft-lock canvas mutation gate | pure gate + boundary |
| Auto-color hints panel (plan-only) | fill-tab mount; **worker `onRun`** dynamic import; **selected `imageSrc` decode on Run** (max-pixel downscale); demo only when src empty; no silent overwrite |
| Edit crop menu reachability | edit controls + menubar |
| Live ink stroke-complete handoff flicker | residual sample admission + `reauthorLastSettledFromDocumentPoints` before committed release |
| CSP Size dynamics Min (pressure floor) | `pressureMinSize` snapshot + `studioBrushPressureWithMinSize` on hardware/velocity channels; Brush Studio “최소 굵기” |
| CSP vector eraser erase-to-intersection | Pure plan + document apply + desktop dock scissors + **mobile eraser sheet** toggle; freehand pen click erases between nearest cuts |

## Still deferred (honest multi-hour / industry)

| Item | Why deferred |
| --- | --- |
| Frame-folder topology / shared gutters | Separate document engine (M–L) |
| Full rich-text / measureText multi-line / vertical 傍点 / SVG ruby | Horizontal MVP only |
| SHAPER texture paint on mesh UI | Pure paint stack exists; poser surface not mounted (multi-hour runtime) |
| Auto-color scribble + Advanced Fill apply batch | Selected-layer plan pixels shipped via `imageSrc`; scribble seeds + fill apply still multi-hour glue |
| Full Magma CRDT / WebGPU scene authority | Architecture multi-year |
| ABR marketplace, cs3* formats | Policy exclusion |
| Workspace cloud sync / shortcut marketplace | Local chrome complete; cloud deferred |

## Stop condition

Finite high-ROI shippable rows for this Clip-Studio-class batch are closed (including post-scan indices wire, ruby TXT, auto-color worker onRun). Remaining items are multi-hour poser runtime, multi-year architecture, or policy exclusions — not open “in progress” glue.

## Verification

- Targeted Vitest residual suites + `tsc --noEmit` after landings.
- Static reachability: export indices wire, auto-color worker onRun, ruby TXT enrichment.
