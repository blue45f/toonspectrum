import {
  STUDIO_BRUSH_QUALITY_DESIGNS,
  studioBrushQualityDesignGroups,
} from "../brush/studio-brush-quality-design-catalog";

import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

/**
 * Compatibility facade for the V5 quality workbench.
 *
 * The canonical 72-design taxonomy now lives beside the normal product brush catalogue so the
 * standard desktop and mobile brush pickers can consume the same vocabulary.
 */
export const BRUSH_QUALITY_CATALOG: readonly BrushCatalogEntry[] =
  STUDIO_BRUSH_QUALITY_DESIGNS;

export const brushQualityCatalogGroups = studioBrushQualityDesignGroups;
