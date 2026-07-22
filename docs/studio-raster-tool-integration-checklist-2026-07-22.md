# Studio raster-tool availability integration checklist

This checklist wires the pure contracts without weakening Studio's document/async ownership
guards. The helper implementation intentionally does not edit `StudioPage.tsx` because another
workstream owns that file.

## Shared entry contract

- Derive simple counts for always-visible rails, then call
  `resolveStudioRasterToolAvailability(tool, context)` for the left rail, top menu, mobile dock and
  inspector. Use the same `entry.reason` in every surface.
- Do not run `summarizeStudioRasterPreparationSources()` on pointer movement. It serializes SVG to
  verify exact fidelity and belongs at command-open / CTA time. Its output maps directly to
  `visibleEditableRasterCount`, `visibleVectorDrawCount`, `exactRenderableVisibleCount`,
  `unsupportedVisibleCount`, `hiddenContentCount` and `hasPageBackground`.
- Keep tool entry and Apply separate. Clone/heal can be armed before an Alt-click source exists;
  history brush can be armed before a history source exists; puppet warp and crop can open before
  a meaningful displacement/crop exists. Disable only Apply using `availability.apply`.
- A disabled native button cannot reliably host an actionable tooltip. Put the recovery CTA in the
  adjacent inspector/empty state or a tooltip popover wrapper, and keep the native `disabled`
  state plus `aria-describedby` reason.

## One reusable preparation command

- Add a single editor command such as `prepareEditableRasterCopy({ tool, sourceIds?, includeBackground })`.
- Capture page id, history index, source fingerprint, document mutation ticket and AbortController
  before `renderStudioEditableRasterCopy()`.
- For visible-page filter copies use `includeBackground: true`, name `필터 합성 레이어`, and insert
  at FRONT. For a protected/animated selected image use only its id, `includeBackground: false`, and
  name `… · 편집 복사본`.
- Recheck `isStudioEditableRasterCopyPlanCurrent()`, page/history ownership and the mutation ticket
  after every await. Materialize and commit exactly one ImageEl only after all checks pass.
- Never delete, hide or patch original layers when preparing a copy. Cancel must make zero document
  commits; Apply must be one undo step.

## Filter without an attached image

- Replace `selected?.type !== "image"` menu/mobile hard gates with the `filter` availability entry.
- Existing selected editable ImageEl keeps the current fast path.
- With no selected ImageEl, plan/render an opaque visible-page copy, keep it virtual while the
  dialog previews, and commit the filtered PNG once only when Apply is pressed.
- A background-only page is a valid filter source. Unsupported/approximated SVG fidelity must fail
  closed with the plan reason instead of applying a visually different result.

## Paint bucket and vector drawings

- Keep the unique-raster auto-select path.
- When `paint-bucket` resolves `virtual-vector-fill`, use
  `planStudioAdvancedFillVectorTarget()` / `renderStudioAdvancedFillVectorReference()` and place the
  materialized color layer below the first visible DrawEl.
- Preview and Cancel remain state-only. Apply inserts one image layer and Undo removes only that
  fill layer, not the source line art.

## Mixed/vector layer merge

- Keep `studio-layer-merge-bake.ts` as the fast ImageEl-only Canvas2D path.
- In the current group fallback branch, call `planStudioDocumentMergeBake()` for mixed sources.
  Render asynchronously, recheck `isStudioDocumentMergeBakePlanCurrent()` plus the editor mutation
  ticket, materialize one ImageEl, then call `applyStudioDocumentMergeBake()` in one commit.
- Only retain group fallback when exact rasterization is unavailable/unsupported and explicitly
  tell the user why. Do not label a group fallback as a completed flatten operation.

## Browser QA

- Desktop and mobile: no-image filter preview → Cancel (no layer) → Apply (one layer) → Undo once.
- Vector line art: bucket preview/cancel/apply, correct z-order below line art, Undo once.
- Smudge/liquify/heal/clone/history/crop/transform/puppet: selected raster direct path and explicit
  `편집용 래스터 복사본 만들기` recovery from a vector/text selection.
- Protected/animated image: original remains untouched; current-frame/edit copy is selected.
- Mixed DrawEl + TextEl merge: one ImageEl, originals removed only on success, Undo once restores
  both. Eraser/unsupported fidelity must remain unchanged and show the exact failure reason.
- Busy panels: controls stay frozen, disabled Apply explains the missing selection/source/pin/crop,
  keyboard focus remains visible, and console errors stay at zero.
