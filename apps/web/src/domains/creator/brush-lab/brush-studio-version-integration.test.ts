import { describe, expect, it } from "vitest";

import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";
import {
  BRUSH_STUDIO_V6_RECIPE_IDS,
  auditBrushStudioVersionIntegration,
  brushStudioV6StorageKey,
  resolveBrushStudioRequestedRecipe,
  resolveLegacyBrushV6RecipeId,
} from "./brush-studio-version-integration";

describe("Brush Studio version integration", () => {
  it("keeps every V5 quality catalogue entry reachable through a real V6 recipe", () => {
    expect(BRUSH_QUALITY_CATALOG).toHaveLength(72);
    expect(auditBrushStudioVersionIntegration()).toEqual([]);
    for (const entry of BRUSH_QUALITY_CATALOG) {
      expect(BRUSH_STUDIO_V6_RECIPE_IDS).toContain(resolveLegacyBrushV6RecipeId(entry));
    }
  });

  it("applies only explicit and known recipe handoffs", () => {
    const requested = resolveBrushStudioRequestedRecipe(
      "?recipe=chroma-sumi&legacyBrush=living-ink&applyRecipe=1",
    );
    expect(requested?.recipeId).toBe("chroma-sumi");
    expect(requested?.legacyBrushId).toBe("living-ink");
    expect(requested?.program.schemaVersion).toBe(6);

    expect(resolveBrushStudioRequestedRecipe("?recipe=chroma-sumi")).toBeNull();
    expect(resolveBrushStudioRequestedRecipe("?recipe=missing&applyRecipe=1")).toBeNull();
    expect(resolveBrushStudioRequestedRecipe("?recipe=clean-ink&legacyBrush=missing&applyRecipe=1"))
      .toBeNull();
  });

  it("keeps document/remix scopes isolated in V6 persistence", () => {
    expect(brushStudioV6StorageKey("work:series/한글"))
      .toBe("toonspectrum.brush-program-v6:work%3Aseries%2F%ED%95%9C%EA%B8%80");
  });
});
