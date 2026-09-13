/** Product exposure for the separately pixel-tested morphology wave, not the internal registry. */
import { studioBrushPackMaterialGroup } from "./studio-brush-pack-index";
import { STUDIO_MATERIAL_BRUSH_DEFINITIONS } from "./studio-material-brush-catalog";

import type { StudioBrushQualityPortfolioEntry } from "./studio-brush-quality-foundation";

export const STUDIO_MATERIAL_BRUSH_PORTFOLIO: readonly StudioBrushQualityPortfolioEntry[] = Object.freeze(
  STUDIO_MATERIAL_BRUSH_DEFINITIONS.map((row): StudioBrushQualityPortfolioEntry => Object.freeze({
    id: `material-${row.program}`,
    label: row.name,
    source: "pro",
    tier: "specialist",
    medium: studioBrushPackMaterialGroup(row.category, row.runtime),
    textureProfile: row.category === "foliage" ? "organic-scatter"
      : row.category === "effect" ? "glitter-particle"
        : row.category === "sketch" ? "graphite-grain" : "material-stamp",
    handFeelProfile: row.mode === "scatter" ? "particle"
      : row.mode === "stamp" ? "pattern"
        : row.runtime === "dry-media" ? "dry-drag" : "flow-stamp",
    liveCommitGate: "seeded-distribution",
    enginePin: "gpu-texture-quality-tie",
    signature: `morphology/${row.program}/area-r8-v1`,
    distinctness: row.hint,
    absorbedIds: Object.freeze([]),
  })),
);
