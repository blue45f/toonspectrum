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
| CSP stroke/shape object snap | `snapPointToObjectGuides` + freehand origin / shape·line endpoints when snapEnabled; mid freehand raw; smart-guide overlay during placement |
| CSP Size dynamics Min (pressure floor) | `pressureMinSize` snapshot + `studioBrushPressureWithMinSize` on hardware/velocity channels; Brush Studio “최소 굵기” |
| CSP vector eraser erase-to-intersection | Pure plan + document apply + desktop dock scissors + **mobile eraser sheet** toggle; freehand pen click erases between nearest cuts |
| CSP layer solo (client-only) | `studio-layer-solo.ts` pure toggle/clear + snapshot restore; navigator 「솔로」 next to 「나만 숨기기」; InspectorAside glue; localHidden only (no CRDT `hidden`) |
| CSP freehand mid-sample object snap (axis latch) | `planFreehandObjectSnapPoint` capture/hold hysteresis; freehand mid samples stick to latched edge (no nearest-edge zigzag); shape/line endpoints unchanged |
| CSP frame-folder seed (bind + child clip + gutter geometry) | `studio-frame-folder.ts` — bind selection under cut folder group, force `noClip: false`, pure shared-gutter midlines; navigator 「컷 폴더로 묶기」 |
| CSP shared-gutter co-edit (drag + child reflow) | `planSharedGutterDrag` / `applySharedGutterDragPlan` — drag midline resizes both frames (gap preserved), reflows children whose center sits in the translated frame; canvas handles in `StudioCanvasGuideOverlayLayers` |

## Still deferred (honest multi-hour / industry)

| Item | Why deferred |
| --- | --- |
| Frame-folder deep topology (multi-frame border ownership, diagonal/poly gutters, nested folder clip stacks) | Axis-aligned co-edit shipped; full topology remains M–L |
| Full rich-text / measureText multi-line / vertical 傍点 / SVG ruby | Horizontal MVP only |
| SHAPER texture paint on mesh UI | Pure paint stack exists; poser surface not mounted (multi-hour runtime) |
| Full Magma CRDT / WebGPU scene authority | Architecture multi-year |
| ABR marketplace, cs3* formats | Policy exclusion |
| Workspace cloud sync / shortcut marketplace | Local chrome complete; cloud deferred |

## Stop condition

Finite high-ROI shippable rows for this Clip-Studio-class batch are closed (including perspective eye-level/horizon lock, stroke/shape object snap for freehand origin + **latched freehand mid samples** + shape·line endpoints, object-snap target cache, mobile immersive menubar polish, CSP layer solo on localHidden, frame-folder **seed** bind+clip+gutter geometry, **shared-gutter co-edit drag + child reflow**, flicker fix, auto-color paths, erase-to-intersection, pressure min size). Remaining items are multi-hour (deep frame-folder topology / poly gutters, SHAPER mesh paint UI), multi-year architecture (Magma CRDT / WebGPU rewrite), or policy exclusions (ABR/cs3*, cloud marketplace) — not open “in progress” glue.

### Canvas engine decision (2026-07-24)

Surveyed whiteboard kits (Excalidraw, tldraw) and low-level engines (Fabric.js, Konva, p5.js, PixiJS).

| Option | Verdict for Studio body |
| --- | --- |
| **Konva / react-konva (current)** | **Keep.** Layer tree, transformers, masks, blend modes, mobile touch, and CRDT→committed scene path already ship here. |
| Excalidraw / tldraw | **Do not replace the body.** Full whiteboard shells (hand-drawn UI, infinite canvas chrome) fight CSP-class plate editing. Optional future: isolated sketch/annotation embed only. |
| Fabric.js | Overlaps Konva object model; migration cost without product upside. |
| p5.js / PixiJS | Creative/WebGL effect engines — optional special-brush/FX path later, not document authority. |

Hybrid policy: Konva remains durable interaction + committed-scene authority; Canvas2D live ink residual + optional WebGPU pin stay as performance overlays. No body rewrite to a whiteboard library.

### Why no further finite slices this pass

Re-scan of `docs/studio-clip-ex-benchmark-2026-07-22.md` “다음 경계” and residual deferred rows found only:

| Candidate | Classification |
| --- | --- |
| Frame-folder deep topology (poly/diagonal gutters, nested ownership) | Axis-aligned co-edit shipped; deeper topology remains M–L |
| Full rich-text / vertical 傍点 / SVG ruby | Multi-line measureText stack |
| SHAPER texture paint on mesh | Poser surface not mounted |
| Continuous freehand mid-sample object-edge snap | **Shipped** via axis latch (`planFreehandObjectSnapPoint`); nearest-edge chase still rejected |
| Workspace cloud sync / shortcut marketplace | Policy + server |
| ABR / cs3* marketplace | Policy exclusion |
| Full Magma CRDT / WebGPU canvas rewrite | Multi-year architecture |

Story split/merge/transfer, text→bubble, fill left/mobile entry, page thumbnail S/M/L, GIF/APNG export, and fill-reference counts are already wired. No additional pure-engine-without-UI high-ROI glue remained after flip-aware canvas seed mapping.

## Verification

- Targeted Vitest residual suites + `tsc --noEmit` after landings.
- Static reachability: export indices wire, auto-color worker onRun, ruby TXT enrichment, scribble apply `onApplyResult` → `patchEl`, canvas seed flip mapping tests.
- Residual stop condition: only industry/multi-hour deferred rows remain.
