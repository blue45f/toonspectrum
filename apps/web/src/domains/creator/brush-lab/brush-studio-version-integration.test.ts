import { describe, expect, it } from "vitest";

import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";
import {
  BRUSH_STUDIO_V6_RECIPE_IDS,
  auditBrushStudioVersionIntegration,
  brushStudioV6StorageKey,
  resolveBrushStudioRequestedRecipe,
  resolveProductBrushV6RecipeId,
} from "./brush-studio-version-integration";

describe("Brush Studio product integration", () => {
  it("keeps every paint product reachable through a real V6 editing recipe", () => {
    expect(BRUSH_QUALITY_CATALOG).toHaveLength(48);
    expect(auditBrushStudioVersionIntegration()).toEqual([]);

    for (const entry of BRUSH_QUALITY_CATALOG) {
      const recipeId = resolveProductBrushV6RecipeId(entry);
      if (entry.group === "지우개") {
        expect(recipeId, entry.id).toBeNull();
      } else {
        expect(BRUSH_STUDIO_V6_RECIPE_IDS, entry.id).toContain(recipeId);
      }
    }
  });

  it("applies only explicit and known product-brush handoffs", () => {
    const requested = resolveBrushStudioRequestedRecipe(
      "?recipe=chroma-sumi&productBrush=ink-wash--sumi-core&applyRecipe=1",
    );
    expect(requested?.recipeId).toBe("chroma-sumi");
    expect(requested?.productBrushId).toBe("ink-wash--sumi-core");
    expect(requested?.program.schemaVersion).toBe(6);

    expect(
      resolveBrushStudioRequestedRecipe("?recipe=chroma-sumi"),
    ).toBeNull();
    expect(
      resolveBrushStudioRequestedRecipe("?recipe=missing&applyRecipe=1"),
    ).toBeNull();
    expect(
      resolveBrushStudioRequestedRecipe(
        "?recipe=clean-ink&productBrush=missing&applyRecipe=1",
      ),
    ).toBeNull();
  });

  it("keeps document/remix scopes isolated in V6 persistence", () => {
    expect(brushStudioV6StorageKey("work:series/한글")).toBe(
      "toonspectrum.brush-program-v6:work%3Aseries%2F%ED%95%9C%EA%B8%80",
    );
  });
});
