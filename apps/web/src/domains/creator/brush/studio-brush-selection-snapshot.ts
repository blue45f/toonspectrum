import { BRUSH_PRESETS } from "../studio-brush";
import { defaultStampTuningForBrushId } from "../studio-page-editor-runtime-contracts";
import { normalizeStudioBrushDynamicsSettings, studioBrushDynamicsSettingsForBrushId } from "./studio-brush-dynamics";
import { normalizeStudioBrushEngineProgramSet, type StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";
import type { StudioBrushSnapshot } from "./studio-brush-library";
import type { StudioBrushCatalogSelection } from "./studio-brush-selection";
import type { StudioBrushSlot } from "./studio-brush-slots";

/** A new catalogue identity releases the previous material while retaining legacy switches. */
function withoutMaterial(programs: StudioBrushEngineProgramSet | null | undefined) {
  if (!programs?.material) return programs ?? null;
  if (!programs.oil && !programs.watercolor && !programs.composition) return null;
  return normalizeStudioBrushEngineProgramSet({ ...programs, material: undefined });
}

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
    enginePrograms: withoutMaterial(current.enginePrograms),
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
    enginePrograms: slot.enginePrograms === undefined
      ? withoutMaterial(current.enginePrograms)
      : slot.enginePrograms,
  };
}
