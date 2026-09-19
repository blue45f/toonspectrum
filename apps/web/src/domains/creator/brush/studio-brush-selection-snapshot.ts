import { BRUSH_PRESETS } from "../studio-brush";
import { defaultStampTuningForBrushId } from "../studio-page-editor-runtime-contracts";
import { normalizeStudioBrushDynamicsSettings, studioBrushDynamicsSettingsForBrushId } from "./studio-brush-dynamics";
import { normalizeStudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import type { StudioBrushSnapshot } from "./studio-brush-library";
import type { StudioBrushCatalogSelection } from "./studio-brush-selection";
import type { StudioBrushSlot } from "./studio-brush-slots";

/**
 * A selected catalogue item owns its engine overrides. Missing overrides mean that item's
 * id-derived baseline, never the preceding brush's oil/watercolor/composition state.
 * Existing saved brushes and committed strokes retain their explicit receipts unchanged.
 */
export function studioBrushCatalogSelectionSnapshot(
  current: StudioBrushSnapshot,
  selection: StudioBrushCatalogSelection,
  applied: Pick<StudioBrushSnapshot, "brushId" | "strokeWidth" | "brushOpacity" | "color">,
): StudioBrushSnapshot {
  const extendedSource = selection.catalogId !== selection.runtimeBrushId;
  return {
    ...current,
    ...applied,
    sourcePresetId: extendedSource ? selection.catalogId : undefined,
    sourcePresetName: extendedSource ? selection.catalogName : undefined,
    stampTuning: defaultStampTuningForBrushId(applied.brushId),
    brushDynamics: normalizeStudioBrushDynamicsSettings(selection.brushDynamics),
    enginePrograms: normalizeStudioBrushEngineProgramSet(selection.enginePrograms),
  };
}

export function studioBrushSlotSelectionSnapshot(
  current: StudioBrushSnapshot,
  slot: StudioBrushSlot,
): StudioBrushSnapshot {
  const preset = BRUSH_PRESETS.find((candidate) => candidate.id === slot.brushId);
  return {
    ...current,
    brushId: slot.brushId,
    sourcePresetId: slot.sourcePresetId,
    sourcePresetName: slot.sourcePresetName,
    strokeWidth: slot.strokeWidth,
    brushOpacity: slot.brushOpacity,
    stampTuning: defaultStampTuningForBrushId(slot.brushId),
    brushDynamics: normalizeStudioBrushDynamicsSettings(
      slot.brushDynamics ?? (preset ? studioBrushDynamicsSettingsForBrushId(preset.id) : undefined),
    ),
    enginePrograms: slot.enginePrograms ?? null,
  };
}
