import { describe, expect, it } from "vitest";

import {
  STUDIO_ADJUSTMENT_ENGINE_IDS,
  studioAdjustmentDefaultParams,
} from "./studio-adjustment-stack";
import {
  STUDIO_EFFECT_RECIPES,
  applyStudioEffectRecipe,
  diagnoseStudioEffectStack,
  duplicateStudioEffectEntry,
  resetStudioEffectEntry,
  searchStudioEffectRecipes,
} from "./studio-effects-workspace";

describe("studio-effects-workspace", () => {
  it("keeps every curated recipe renderer-backed, uniquely named and non-empty", () => {
    const supported = new Set<string>(STUDIO_ADJUSTMENT_ENGINE_IDS);
    const recipeIds = new Set<string>();

    expect(STUDIO_EFFECT_RECIPES).toHaveLength(15);
    for (const recipe of STUDIO_EFFECT_RECIPES) {
      expect(recipeIds.has(recipe.id)).toBe(false);
      recipeIds.add(recipe.id);
      expect(recipe.entries.length).toBeGreaterThan(0);
      expect(recipe.tags.length).toBeGreaterThanOrEqual(4);
      for (const entry of recipe.entries) {
        expect(supported.has(entry.engine)).toBe(true);
        if (entry.opacity !== undefined) {
          expect(entry.opacity).toBeGreaterThanOrEqual(0);
          expect(entry.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("admits every recipe through the canonical stack boundary", () => {
    for (const recipe of STUDIO_EFFECT_RECIPES) {
      const receipt = applyStudioEffectRecipe(undefined, recipe.id, "replace");
      expect(receipt.status).toBe("accepted");
      expect(receipt.addedCount).toBe(recipe.entries.length);
      expect(receipt.stack.entries).toHaveLength(recipe.entries.length);
    }
  });

  it("searches Korean purpose words and English tags within an optional category", () => {
    expect(searchStudioEffectRecipes("선화").map((recipe) => recipe.id)).toContain("crisp-ink");
    expect(searchStudioEffectRecipes("night").map((recipe) => recipe.id)).toContain("night-neon");
    expect(searchStudioEffectRecipes("인쇄", "print").length).toBeGreaterThanOrEqual(2);
    expect(searchStudioEffectRecipes("인쇄", "light")).toEqual([]);
    expect(searchStudioEffectRecipes("사진 → webtoon").map((recipe) => recipe.id)).toContain(
      "photo-webtoon-soft",
    );
    expect(searchStudioEffectRecipes("night glow").map((recipe) => recipe.id)).toContain(
      "night-neon",
    );
  });

  it("appends a recipe without modifying existing entries", () => {
    const before = {
      version: 1 as const,
      entries: [{
        id: "existing",
        engine: "invert" as const,
        enabled: false,
        params: {},
      }],
    };
    const receipt = applyStudioEffectRecipe(before, "crisp-ink", "append");

    expect(receipt.status).toBe("accepted");
    expect(receipt.addedCount).toBe(3);
    expect(receipt.replacedCount).toBe(0);
    expect(receipt.stack.entries[0]).toEqual(before.entries[0]);
    expect(receipt.stack.entries.slice(1).map((entry) => entry.engine)).toEqual([
      "levels",
      "difference-of-gaussians",
      "smart-sharpen",
    ]);
  });

  it("replaces the stack atomically when replace mode is selected", () => {
    const before = {
      version: 1 as const,
      entries: [{ id: "existing", engine: "invert" as const, enabled: true, params: {} }],
    };
    const receipt = applyStudioEffectRecipe(before, "mono-screentone", "replace");

    expect(receipt.status).toBe("accepted");
    expect(receipt.replacedCount).toBe(1);
    expect(receipt.stack.entries.map((entry) => entry.engine)).toEqual([
      "grayscale",
      "levels",
      "color-halftone",
    ]);
    expect(receipt.stack.entries.some((entry) => entry.id === "existing")).toBe(false);
  });

  it("allocates collision-free recipe entry ids across repeated appends", () => {
    const first = applyStudioEffectRecipe(undefined, "focus-pull", "append").stack;
    const second = applyStudioEffectRecipe(first, "focus-pull", "append").stack;
    const ids = second.entries.map((entry) => entry.id);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^fxr-focus-pull-1-/u);
    expect(ids[1]).toMatch(/^fxr-focus-pull-2-/u);
  });

  it("keeps the original stack on an unknown recipe", () => {
    const before = {
      version: 1 as const,
      entries: [{ id: "existing", engine: "invert" as const, enabled: true, params: {} }],
    };
    const receipt = applyStudioEffectRecipe(before, "missing-recipe", "replace");

    expect(receipt.status).toBe("unknown-recipe");
    expect(receipt.stack).toEqual(before);
    expect(receipt.addedCount).toBe(0);
  });

  it("duplicates an entry immediately after its source with independent params", () => {
    const before = {
      version: 1 as const,
      entries: [
        {
          id: "blur-1",
          engine: "gaussian-blur" as const,
          enabled: true,
          opacity: 0.4,
          params: { radius: 8, strength: 70 },
        },
        { id: "invert-1", engine: "invert" as const, enabled: true, params: {} },
      ],
    };
    const next = duplicateStudioEffectEntry(before, "blur-1");

    expect(next.entries.map((entry) => entry.engine)).toEqual([
      "gaussian-blur",
      "gaussian-blur",
      "invert",
    ]);
    expect(next.entries[1]?.id).toBe("blur-1-copy");
    expect(next.entries[1]?.opacity).toBe(0.4);
    expect(next.entries[1]?.params).toEqual({ radius: 8, strength: 70 });
    expect(next.entries[1]?.params).not.toBe(next.entries[0]?.params);
  });

  it("increments duplicate ids without overwriting an existing copy", () => {
    const before = {
      version: 1 as const,
      entries: [
        { id: "invert-1", engine: "invert" as const, enabled: true, params: {} },
        { id: "invert-1-copy", engine: "invert" as const, enabled: true, params: {} },
      ],
    };
    const next = duplicateStudioEffectEntry(before, "invert-1");

    expect(next.entries.map((entry) => entry.id)).toEqual([
      "invert-1",
      "invert-1-copy-2",
      "invert-1-copy",
    ]);
  });

  it("resets parameters and opacity while preserving identity and visibility", () => {
    const before = {
      version: 1 as const,
      entries: [{
        id: "blur-1",
        engine: "gaussian-blur" as const,
        enabled: false,
        opacity: 0.35,
        params: { radius: 31, strength: 12 },
      }],
    };

    const next = resetStudioEffectEntry(before, "blur-1");

    expect(next.entries[0]).toEqual({
      id: "blur-1",
      engine: "gaussian-blur",
      enabled: false,
      params: studioAdjustmentDefaultParams("gaussian-blur"),
    });
  });

  it("classifies a lightweight stack without inventing millisecond timings", () => {
    const diagnostics = diagnoseStudioEffectStack({
      version: 1,
      entries: [
        { id: "levels", engine: "levels", enabled: true, params: {} },
        { id: "curve", engine: "curves", enabled: true, params: {} },
      ],
    });

    expect(diagnostics.tier).toBe("light");
    expect(diagnostics.costPoints).toBe(2);
    expect(diagnostics.recommendedPreviewScale).toBe(1);
    expect(diagnostics.messages).toEqual([]);
  });

  it("warns about high-cost blur and geometry stacks", () => {
    const diagnostics = diagnoseStudioEffectStack({
      version: 1,
      entries: [
        {
          id: "lens",
          engine: "lens-blur",
          enabled: true,
          params: { radius: 18, sampleCount: 48 },
        },
        {
          id: "iris",
          engine: "field-iris-blur",
          enabled: true,
          params: { maximumBlurRadius: 12, sampleCount: 32 },
        },
        {
          id: "tilt",
          engine: "tilt-shift-blur",
          enabled: true,
          params: { maximumBlurRadius: 12, sampleCount: 32 },
        },
        { id: "wave", engine: "wave-warp", enabled: true, params: {} },
        { id: "twirl", engine: "twirl", enabled: true, params: {} },
      ],
    });

    expect(diagnostics.tier).toBe("heavy");
    expect(diagnostics.recommendedPreviewScale).toBe(0.5);
    expect(diagnostics.messages.map((message) => message.id)).toEqual(
      expect.arrayContaining(["expensive-stack", "blur-stack", "geometry-stack"]),
    );
  });

  it("explains when color grading after a monochrome conversion acts as tinting", () => {
    const diagnostics = diagnoseStudioEffectStack({
      version: 1,
      entries: [
        { id: "mono", engine: "grayscale", enabled: true, params: {} },
        { id: "grade", engine: "color-balance", enabled: true, params: { preset: "warm" } },
      ],
    });

    expect(diagnostics.messages.map((message) => message.id)).toContain("mono-color-order");
  });

  it("flags alpha-order and zero-opacity cleanup while counting disabled entries correctly", () => {
    const diagnostics = diagnoseStudioEffectStack({
      version: 1,
      entries: [
        { id: "alpha", engine: "color-to-alpha", enabled: true, params: {} },
        { id: "blur", engine: "gaussian-blur", enabled: true, params: {} },
        { id: "zero", engine: "invert", enabled: true, opacity: 0, params: {} },
        { id: "off", engine: "sepia", enabled: false, params: {} },
      ],
    });

    expect(diagnostics.activeCount).toBe(2);
    expect(diagnostics.zeroOpacityCount).toBe(1);
    expect(diagnostics.disabledCount).toBe(1);
    expect(diagnostics.messages.map((message) => message.id)).toEqual(
      expect.arrayContaining(["alpha-order", "zero-opacity"]),
    );
  });
});
