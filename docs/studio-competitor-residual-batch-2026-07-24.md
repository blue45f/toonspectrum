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
| Auto-color hints panel + scribble/apply | fill-tab; worker `onRun`; selected `imageSrc`; **scribble seed palette + rec chips**; **canvas click + freehand stroke seed sampling** (axis-aligned + **H/V flip**, 180°); **Advanced Fill batch apply** via `onApplyResult` → `patchEl`; **새 채색 레이어** multi-layer target via `onApplyNewLayer` |
| Edit crop menu reachability | edit controls + menubar |
| Live ink stroke-complete handoff flicker | residual sample admission + `reauthorLastSettledFromDocumentPoints` before committed release; brush-alias mapped reauthor pressures + noop clear skip (`a069e708`) |
| CSP perspective eye-level / horizon lock | Independent `eyeLevelY` + `lockHorizon` on drawing-assist document (legacy envelope still parses); pure constrain/align/co-move; panel + overlay horizon handle; CRDT dual-key validation |
| CSP Size dynamics Min (pressure floor) | `pressureMinSize` snapshot + `studioBrushPressureWithMinSize` on hardware/velocity channels; Brush Studio “최소 굵기” |
| CSP vector eraser erase-to-intersection | Pure plan + document apply + desktop dock scissors + **mobile eraser sheet** toggle; freehand pen click erases between nearest cuts |

## Still deferred (honest multi-hour / industry)

| Item | Why deferred |
| --- | --- |
| Frame-folder topology / shared gutters | Separate document engine (M–L) |
| Full rich-text / measureText multi-line / vertical 傍点 / SVG ruby | Horizontal MVP only |
| SHAPER texture paint on mesh UI | Pure paint stack exists; poser surface not mounted (multi-hour runtime) |
| Full Magma CRDT / WebGPU scene authority | Architecture multi-year |
| ABR marketplace, cs3* formats | Policy exclusion |
| Workspace cloud sync / shortcut marketplace | Local chrome complete; cloud deferred |

## Stop condition

Finite high-ROI shippable rows for this Clip-Studio-class batch are closed (including post-scan indices wire, ruby TXT, auto-color worker onRun, pressure min size, erase-to-intersection desktop+mobile, auto-color selected imageSrc + scribble seeds + canvas click/stroke seed sampling with flip-aware mapping + Advanced Fill apply + multi-layer paint target). Remaining items are multi-hour poser runtime (frame-folder topology, SHAPER mesh paint UI), multi-year architecture (Magma CRDT / WebGPU rewrite), or policy exclusions (ABR/cs3*, cloud marketplace) — not open “in progress” glue.

### Why no further finite slices this pass

Re-scan of `docs/studio-clip-ex-benchmark-2026-07-22.md` “다음 경계” and residual deferred rows found only:

| Candidate | Classification |
| --- | --- |
| Frame-folder shared gutters / child clip topology | Separate document engine (M–L) |
| Full rich-text / vertical 傍点 / SVG ruby | Multi-line measureText stack |
| SHAPER texture paint on mesh | Poser surface not mounted |
| Object snap for stroke/shape placement (not selection) | Smart-guides already cover select-transform; freehand continuous object-edge snap is multi-hour UX without false-positive geometry |
| Workspace cloud sync / shortcut marketplace | Policy + server |
| ABR / cs3* marketplace | Policy exclusion |
| Full Magma CRDT / WebGPU canvas rewrite | Multi-year architecture |

Story split/merge/transfer, text→bubble, fill left/mobile entry, page thumbnail S/M/L, GIF/APNG export, and fill-reference counts are already wired. No additional pure-engine-without-UI high-ROI glue remained after flip-aware canvas seed mapping.

## Verification

- Targeted Vitest residual suites + `tsc --noEmit` after landings.
- Static reachability: export indices wire, auto-color worker onRun, ruby TXT enrichment, scribble apply `onApplyResult` → `patchEl`, canvas seed flip mapping tests.
- Residual stop condition: only industry/multi-hour deferred rows remain.
