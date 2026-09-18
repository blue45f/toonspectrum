/** Lazy, exact materialization of V6 catalogue selections. */
import { BRUSH_STUDIO_V6_RECIPES } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";

import { studioV6BrushCatalogItemById } from "./studio-brush-v6-catalog";
import { studioV6RecipeIdFromCatalogId } from "./studio-brush-v6-id";

import type { BrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import type { StudioBrushCatalogSelection } from "./studio-brush-selection";

const RECIPE_BY_ID = new Map(
  BRUSH_STUDIO_V6_RECIPES.map((recipe) => [recipe.id, recipe]),
);
const SELECTION_BY_CATALOG_ID = new Map<string, StudioBrushCatalogSelection>();

export function studioV6BrushProgramForCatalogId(
  catalogId: unknown,
): BrushStudioV6Program | null {
  const recipeId = studioV6RecipeIdFromCatalogId(catalogId);
  return recipeId ? RECIPE_BY_ID.get(recipeId)?.create() ?? null : null;
}

export function materializeStudioV6BrushCatalogSelection(
  catalogId: unknown,
): StudioBrushCatalogSelection | null {
  if (typeof catalogId !== "string") return null;
  const cached = SELECTION_BY_CATALOG_ID.get(catalogId);
  if (cached) return cached;
  const program = studioV6BrushProgramForCatalogId(catalogId);
  if (!program) return null;
  const product = createBrushStudioV6ProductBrush(program);
  if (product.enginePrograms?.material?.runtime?.fallbackPolicy !== "none") {
    throw new Error(
      `${program.name}의 무폴백 엔진 실행 영수증을 만들지 못했어요.`,
    );
  }
  const selection = Object.freeze({
    catalogId,
    catalogName: program.name,
    runtimeBrushId: product.brushId,
    operation: "paint" as const,
    // Product selection uses the perceived-size policy; the material receipt keeps its authored
    // tuning and the live renderer replaces tuning.size with the selected element stroke width.
    defaultWidth: studioV6BrushCatalogItemById(catalogId)?.defaultWidth ?? product.strokeWidth,
    defaultOpacity: product.brushOpacity,
    defaultColor: product.color,
    brushDynamics: product.brushDynamics,
    enginePrograms: product.enginePrograms,
  });
  SELECTION_BY_CATALOG_ID.set(catalogId, selection);
  return selection;
}
