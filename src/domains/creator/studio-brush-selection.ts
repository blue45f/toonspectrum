import {
  studioBrushDynamicsSettingsForBrushId,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";

import type { BrushPreset } from "./studio-brush";

/**
 * Catalogue identity is deliberately separate from the renderer identity.
 *
 * Extended brush packs are materialized to one of the stable dynamic-dab engines and carry their
 * complete dynamics snapshot. A saved stroke therefore remains pixel-replayable even when the
 * optional catalogue chunk is unavailable or an older collaboration client opens the document.
 */
export interface StudioBrushCatalogSelection {
  catalogId: string;
  catalogName: string;
  runtimeBrushId: string;
  defaultWidth: number;
  defaultOpacity: number;
  defaultColor?: string;
  brushDynamics: NormalizedStudioBrushDynamicsSettings | null;
}

export function studioCoreBrushCatalogSelection(
  preset: BrushPreset
): StudioBrushCatalogSelection {
  return {
    catalogId: preset.id,
    catalogName: preset.name,
    runtimeBrushId: preset.id,
    defaultWidth: preset.defaultWidth,
    defaultOpacity: preset.defaultOpacity,
    ...(preset.defaultColor ? { defaultColor: preset.defaultColor } : {}),
    brushDynamics: studioBrushDynamicsSettingsForBrushId(preset.id),
  };
}

export function isStudioBrushCatalogSelection(
  value: unknown
): value is StudioBrushCatalogSelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioBrushCatalogSelection>;
  return typeof candidate.catalogId === "string"
    && candidate.catalogId.length > 0
    && typeof candidate.catalogName === "string"
    && candidate.catalogName.length > 0
    && typeof candidate.runtimeBrushId === "string"
    && candidate.runtimeBrushId.length > 0
    && typeof candidate.defaultWidth === "number"
    && Number.isFinite(candidate.defaultWidth)
    && typeof candidate.defaultOpacity === "number"
    && Number.isFinite(candidate.defaultOpacity)
    && (candidate.brushDynamics === null || typeof candidate.brushDynamics === "object");
}
