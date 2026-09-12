import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";
import {
  BRUSH_STUDIO_V6_RECIPES,
  createBrushStudioV6Program,
  type BrushStudioV6Program,
} from "./brush-studio-v6-engine";

import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

export const BRUSH_STUDIO_V6_RECIPE_IDS: readonly string[] = Object.freeze(
  BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.id),
);

function has(entry: BrushCatalogEntry, pattern: RegExp): boolean {
  return pattern.test(`${entry.id} ${entry.name} ${entry.signature}`);
}

/** Selects a V6 editing start for a shipped product brush. Erasers have no paint recipe. */
export function resolveProductBrushV6RecipeId(
  entry: BrushCatalogEntry,
): string | null {
  if (entry.group === "지우개") return null;

  if (entry.group === "선화·잉크") {
    if (has(entry, /calligraphy|fountain|캘리/iu)) {
      return "natural-calligraphy";
    }
    if (has(entry, /gpen|g펜/iu)) return "manga-gpen";
    return "clean-ink";
  }

  if (entry.group === "마커·형광펜") return "alcohol-bloom";

  if (entry.group === "연필·목탄·건식") {
    return has(entry, /charcoal|목탄/iu)
      ? "eroding-charcoal"
      : "velvet-graphite";
  }

  if (entry.group === "수채·수묵·과슈") {
    if (has(entry, /sumi|inkwash|ink-wash|수묵|먹/iu)) {
      return "chroma-sumi";
    }
    return "mineral-bloom";
  }

  if (entry.group === "유화·페인트") {
    return has(entry, /impasto|knife|나이프|임파스토/iu)
      ? "impasto-knife"
      : "oil-hair-mixer";
  }

  if (entry.group === "에어·입자·FX") {
    if (has(entry, /neon|네온/iu)) return "dripping-neon";
    return "kaleido-swarm";
  }

  if (has(entry, /hair|stitch|헤어|스티치/iu)) {
    return "holographic-stitch";
  }
  if (has(entry, /fabric|brick|leaf|foliage|패브릭|벽돌|수관/iu)) {
    return "moss-flow";
  }
  return "document-halftone";
}

export interface BrushStudioRequestedRecipe {
  readonly recipeId: string;
  readonly productBrushId: string | null;
  readonly program: BrushStudioV6Program;
}

export function resolveBrushStudioRequestedRecipe(
  search: string,
): BrushStudioRequestedRecipe | null {
  const params = new URLSearchParams(search);
  if (params.get("applyRecipe") !== "1") return null;

  const recipeId = params.get("recipe");
  if (!recipeId || !BRUSH_STUDIO_V6_RECIPE_IDS.includes(recipeId)) {
    return null;
  }

  const productBrushId = params.get("productBrush");
  if (
    productBrushId &&
    !BRUSH_QUALITY_CATALOG.some((entry) => entry.id === productBrushId)
  ) {
    return null;
  }

  return Object.freeze({
    recipeId,
    productBrushId,
    program: createBrushStudioV6Program(recipeId),
  });
}

export function brushStudioV6StorageKey(scope: string): string {
  return `toonspectrum.brush-program-v6:${encodeURIComponent(scope)}`;
}

export function auditBrushStudioVersionIntegration(): readonly string[] {
  const recipes = new Set(BRUSH_STUDIO_V6_RECIPE_IDS);
  return Object.freeze(
    BRUSH_QUALITY_CATALOG.flatMap((entry) => {
      const recipeId = resolveProductBrushV6RecipeId(entry);
      if (recipeId === null || recipes.has(recipeId)) return [];
      return [`${entry.id} maps to missing V6 recipe ${recipeId}`];
    }),
  );
}
