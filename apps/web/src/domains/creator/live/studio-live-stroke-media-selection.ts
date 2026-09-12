import { resolveStudioStampBrushKind } from "../brush/studio-brush-stamp-engine";
import { isDirectLiveDraftEl, isDirectLiveStampDraftEl } from "../brush/studio-draw-rendering";
import { studioHokusaiProductLivePreset, studioLivingInkSupportsElement } from "../studio-legacy-editor-runtime-helpers";
import { isStudioPixelPencilRenderMode } from "../studio-pixel-pencil";
import { studioLiveDynamicBrushOverlaySupportsElement } from "./studio-live-dynamic-brush-overlay";
import { studioLiveInkLaneSelectsGpu } from "./studio-live-ink-lane-admission";
import { studioLiveRetainedMediaOverlaySupportsElement } from "./studio-live-retained-media-overlay";
import { studioLiveWetInkOverlaySupportsElement } from "./studio-live-wet-ink-overlay";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveInkLaneSelectionInput } from "./studio-live-ink-lane-admission";

export type StudioLiveStrokeMediaSelection =
  | { readonly kind: "stamp"; readonly stampKind: NonNullable<ReturnType<typeof resolveStudioStampBrushKind>> }
  | { readonly kind: "living-ink" | "hokusai" | "wet" | "retained" | "dynamic" | "webgpu" | "canvas2d" | "none" };

export interface StudioLiveStrokeMediaSelectionInput extends Omit<StudioLiveInkLaneSelectionInput, "element"> {
  readonly livingInkPhysicalModeEnabled: boolean;
  readonly retainedHasSettledStrokes: boolean;
}

export function studioHokusaiLiveStrokeSelected(element: DrawEl): boolean {
  return element.mode === "pen"
    && (element.kind ?? "freehand") === "freehand"
    && Boolean(studioHokusaiProductLivePreset(element.brush ?? "pen", element.brushCatalogId));
}

/** Select one compatible owner before any provider is started; readiness failures never select a fallback. */
export function selectStudioLiveStrokeMedia(
  next: DrawEl,
  input: StudioLiveStrokeMediaSelectionInput,
): StudioLiveStrokeMediaSelection {
  const pixelDirect = isStudioPixelPencilRenderMode(next.brush);
  const materialSelected = next.mode !== "eraser" && Boolean(next.brushEnginePrograms?.material);
  const livingInkSelected = !materialSelected && studioLivingInkSupportsElement(
    next,
    input.livingInkPhysicalModeEnabled,
  );
  const hokusaiSelected = !materialSelected && !livingInkSelected && studioHokusaiLiveStrokeSelected(next);
  const stampKind = resolveStudioStampBrushKind(next.brush);
  const stampSelected = !materialSelected && !livingInkSelected
    && !hokusaiSelected
    && Boolean(stampKind)
    && isDirectLiveStampDraftEl(next);
  const wetMediaSelected = !materialSelected && !livingInkSelected
    && !hokusaiSelected
    && !stampSelected
    && !pixelDirect
    && studioLiveWetInkOverlaySupportsElement(next);
  const retainedMediaSelected = !livingInkSelected
    && !hokusaiSelected
    && !stampSelected
    && !wetMediaSelected
    && !pixelDirect
    && (next.mode !== "eraser" || input.retainedHasSettledStrokes)
    && studioLiveRetainedMediaOverlaySupportsElement(next);
  const dynamicSelected = !livingInkSelected
    && !hokusaiSelected
    && !stampSelected
    && !wetMediaSelected
    && !retainedMediaSelected
    && !pixelDirect
    && studioLiveDynamicBrushOverlaySupportsElement(next);
  const genericDirectSelected = !livingInkSelected
    && !hokusaiSelected
    && !stampSelected
    && !wetMediaSelected
    && !retainedMediaSelected
    && !dynamicSelected
    && !pixelDirect
    && isDirectLiveDraftEl(next);
  const gpuSelected = genericDirectSelected && studioLiveInkLaneSelectsGpu({ ...input, element: next });
  if (livingInkSelected) return { kind: "living-ink" };
  if (hokusaiSelected) return { kind: "hokusai" };
  if (stampSelected && stampKind) return { kind: "stamp", stampKind };
  if (wetMediaSelected) return { kind: "wet" };
  if (retainedMediaSelected) return { kind: "retained" };
  if (dynamicSelected) return { kind: "dynamic" };
  if (gpuSelected) return { kind: "webgpu" };
  return { kind: genericDirectSelected ? "canvas2d" : "none" };
}
