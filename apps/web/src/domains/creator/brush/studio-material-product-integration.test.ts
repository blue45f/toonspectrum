import { describe, expect, it } from "vitest";

import { BRUSH_QUALITY_CATALOG } from "../brush-lab/brush-studio-v5-quality-catalog";
import {
  resolveBrushStudioRequestedRecipe,
  resolveProductBrushV6RecipeId,
} from "../brush-lab/brush-studio-version-integration";

import {
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS,
  filterStudioBrushCatalogItems,
} from "./studio-brush-catalog";
import { STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS } from "./studio-brush-quality-portfolio";
import { materializeStudioBrushCatalogSelection } from "./studio-brush-selection";
import {
  STUDIO_MATERIAL_BRUSH_DEFINITIONS,
  STUDIO_MATERIAL_BRUSH_IDS,
} from "./studio-material-brush-catalog";

describe("original material product integration", () => {
  it("shares exact ordered identities across the picker, quality editor and curated inventory", () => {
    expect(STUDIO_MATERIAL_BRUSH_IDS).toHaveLength(40);
    expect(BRUSH_QUALITY_CATALOG.map(({ id }) => id)).toEqual(
      STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
    );
    expect(STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map(({ id }) => id)).toEqual(
      STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
    );
    expect(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS
        .slice(0, STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS.length)
        .map(({ id }) => id),
    ).toEqual(STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS);
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(
      STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.length,
    );
    expect(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(86);
    expect(STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS).toHaveLength(2);
  });

  it.each(STUDIO_MATERIAL_BRUSH_DEFINITIONS)("preserves $program through Korean search, selection and an explicit editing-start handoff", async (definition) => {
    const id = `material-${definition.program}`;
    const matches = filterStudioBrushCatalogItems({ category: "marker", query: definition.name });
    expect(matches.some((entry) => entry.id === id)).toBe(true);
    const selection = await materializeStudioBrushCatalogSelection(id);
    expect(selection).toMatchObject({
      catalogId: id,
      catalogName: definition.name,
      runtimeBrushId: definition.runtime,
      operation: "paint",
      defaultWidth: definition.width,
      defaultOpacity: definition.opacity,
    });
    expect(selection?.brushDynamics?.tip.alphaMapBase64?.length).toBeGreaterThan(0);
    const entry = BRUSH_QUALITY_CATALOG.find((candidate) => candidate.id === id);
    expect(entry).toBeDefined();
    if (!entry || !selection) throw new Error(`material product missing: ${id}`);
    const selectedSnapshot = JSON.stringify(selection);
    const recipe = resolveProductBrushV6RecipeId(entry);
    expect(recipe).not.toBeNull();
    const params = new URLSearchParams({ recipe: recipe!, productBrush: id, applyRecipe: "1" });
    const handoff = resolveBrushStudioRequestedRecipe(`?${params}`);
    expect(handoff).toMatchObject({ productBrushId: id, recipeId: recipe });
    expect(handoff?.program.schemaVersion).toBe(6);
    // V6 is an explicit editing START, not a promise that the material field is converted to V6.
    // Inspecting that start must not mutate the canonical selection used by live drawing/replay.
    expect(JSON.stringify(selection)).toBe(selectedSnapshot);
    params.delete("applyRecipe");
    expect(resolveBrushStudioRequestedRecipe(`?${params}`)).toBeNull();
  });
});
