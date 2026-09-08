import { describe, expect, it } from "vitest";
import {
  filterStudioHelpRecipes,
  getStudioContextHelpGuide,
  getStudioHelpRecipe,
  STUDIO_CONTEXT_HELP_GUIDES,
  STUDIO_HELP_RECIPES,
} from "./studio-help-content";

describe("studio contextual help content", () => {
  it("provides a concise guide for every high-frequency canvas tool", () => {
    const commandIds = [
      "tool.pen",
      "tool.pixel-pen",
      "tool.eraser",
      "tool.fill",
      "tool.smart-shape",
      "tool.smudge",
      "tool.wet-mix",
      "tool.dodge-burn",
      "tool.liquify",
      "select.quick-mask",
      "tool.hand",
      "tool.select",
      "tool.marquee-rect",
      "tool.marquee-ellipse",
      "tool.lasso",
      "tool.transform",
      "tool.crop",
      "tool.eyedropper",
      "tool.comment",
    ];

    for (const commandId of commandIds) {
      const guide = getStudioContextHelpGuide(commandId);
      expect(guide, commandId).not.toBeNull();
      expect(guide?.steps, commandId).toHaveLength(3);
      expect(guide?.summary.trim().length, commandId).toBeGreaterThan(20);
      expect(guide?.troubleshooting.length, commandId).toBeGreaterThan(0);
    }
  });

  it("keeps guide and command identifiers unique", () => {
    const guideIds = STUDIO_CONTEXT_HELP_GUIDES.map((guide) => guide.id);
    const commandIds = STUDIO_CONTEXT_HELP_GUIDES.flatMap((guide) => guide.commandIds);

    expect(new Set(guideIds).size).toBe(guideIds.length);
    expect(new Set(commandIds).size).toBe(commandIds.length);
  });

  it("keeps every related recipe link resolvable", () => {
    for (const guide of STUDIO_CONTEXT_HELP_GUIDES) {
      for (const recipeId of guide.relatedRecipeIds) {
        expect(getStudioHelpRecipe(recipeId), `${guide.id} -> ${recipeId}`).not.toBeNull();
      }
    }
  });

  it("keeps recipe identifiers unique and actionable", () => {
    const recipeIds = STUDIO_HELP_RECIPES.map((recipe) => recipe.id);
    expect(new Set(recipeIds).size).toBe(recipeIds.length);

    for (const recipe of STUDIO_HELP_RECIPES) {
      expect(recipe.checks.length, recipe.id).toBeGreaterThanOrEqual(3);
      expect(recipe.primaryAction.label.trim().length, recipe.id).toBeGreaterThan(0);
    }
  });

  it("finds recipes from symptoms, aliases, and technical terms", () => {
    expect(filterStudioHelpRecipes("채우기 새").map((recipe) => recipe.id)).toContain("fill-leaks");
    expect(filterStudioHelpRecipes("GPU 렉").map((recipe) => recipe.id)).toContain("canvas-lag");
    expect(filterStudioHelpRecipes("포토샵 용어").map((recipe) => recipe.id)).toContain("terminology-gap");
    expect(filterStudioHelpRecipes("자동 저장 복구").map((recipe) => recipe.id)).toContain("save-and-recovery");
  });

  it("returns the full recipe set for an empty query", () => {
    expect(filterStudioHelpRecipes("   ")).toBe(STUDIO_HELP_RECIPES);
  });
});
