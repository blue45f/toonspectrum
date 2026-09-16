/** Stable catalogue identity for Brush Studio V6 recipes. */
export const STUDIO_V6_BRUSH_CATALOG_ID_PREFIX = "v6:" as const;

export function studioV6BrushCatalogId(recipeId: string): string {
  return `${STUDIO_V6_BRUSH_CATALOG_ID_PREFIX}${recipeId}`;
}

export function studioV6RecipeIdFromCatalogId(catalogId: unknown): string | null {
  if (
    typeof catalogId !== "string"
    || !catalogId.startsWith(STUDIO_V6_BRUSH_CATALOG_ID_PREFIX)
  ) return null;
  const recipeId = catalogId.slice(STUDIO_V6_BRUSH_CATALOG_ID_PREFIX.length);
  return /^[a-z0-9][a-z0-9-]{0,95}$/u.test(recipeId) ? recipeId : null;
}

export function isStudioV6BrushCatalogId(catalogId: unknown): catalogId is string {
  return studioV6RecipeIdFromCatalogId(catalogId) !== null;
}
