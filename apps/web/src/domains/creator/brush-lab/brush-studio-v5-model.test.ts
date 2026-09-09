import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V5_RECIPES,
  analyzeBrushStudioV5Draft,
  applyBrushStudioV5Recipe,
  createDefaultBrushStudioV5Draft,
  normalizeBrushStudioV5Draft,
  optimizeBrushStudioV5Draft,
  parseBrushStudioV5Draft,
  randomizeBrushStudioV5Draft,
  toggleBrushStudioV5Finish,
  toggleBrushStudioV5Physics,
} from "./brush-studio-v5-model";

describe("Brush Studio V5 composition model", () => {
  it("creates a valid WebGPU-first default program", () => {
    const draft = createDefaultBrushStudioV5Draft();
    const analysis = analyzeBrushStudioV5Draft(draft);

    expect(draft.schemaVersion).toBe(5);
    expect(draft.strokeEngineId).toBe("native-webgpu");
    expect(analysis.valid).toBe(true);
    expect(analysis.executionPlan[0]).toContain("입력");
    expect(analysis.performanceScore).toBeGreaterThan(50);
  });

  it("fails closed when Inkwash has no wet-flow authority", () => {
    const draft = normalizeBrushStudioV5Draft({
      ...createDefaultBrushStudioV5Draft(),
      strokeEngineId: "inkwash",
      materialId: "living-ink",
      pigmentId: "inkwash-density",
      physicsIds: [],
    });
    const analysis = analyzeBrushStudioV5Draft(draft);

    expect(analysis.valid).toBe(false);
    expect(analysis.issues.map((issue) => issue.id)).toContain("inkwash-flow");
  });

  it("keeps every curated signature recipe executable", () => {
    const base = createDefaultBrushStudioV5Draft();

    for (const recipe of BRUSH_STUDIO_V5_RECIPES) {
      const draft = applyBrushStudioV5Recipe(base, recipe.id);
      const errors = analyzeBrushStudioV5Draft(draft).issues.filter(
        (issue) => issue.severity === "error",
      );
      expect(errors, recipe.id).toEqual([]);
    }
  });

  it("optimizes living ink into a complete Inkwash execution plan", () => {
    const source = normalizeBrushStudioV5Draft({
      ...createDefaultBrushStudioV5Draft(),
      materialId: "living-ink",
      pigmentId: "rgb",
      strokeEngineId: "libmypaint",
      physicsIds: [],
    });
    const optimized = optimizeBrushStudioV5Draft(source);

    expect(optimized.strokeEngineId).toBe("inkwash");
    expect(optimized.pigmentId).toBe("inkwash-density");
    expect(optimized.physicsIds).toContain("inkwash-flow");
    expect(analyzeBrushStudioV5Draft(optimized).valid).toBe(true);
  });

  it("adds and removes independent physics and finish modules", () => {
    const base = createDefaultBrushStudioV5Draft();
    const withPhysics = toggleBrushStudioV5Physics(base, "reaction-diffusion");
    const withFinish = toggleBrushStudioV5Finish(withPhysics, "grain-boost");
    const removed = toggleBrushStudioV5Physics(withFinish, "reaction-diffusion");

    expect(withPhysics.physicsIds).toEqual(["reaction-diffusion"]);
    expect(withFinish.finishIds).toEqual(["grain-boost"]);
    expect(removed.physicsIds).toEqual([]);
  });

  it("normalizes imported programs and removes unknown modules", () => {
    const base = createDefaultBrushStudioV5Draft();
    const parsed = parseBrushStudioV5Draft(JSON.stringify({
      kind: "toonspectrum.brush-studio-v5",
      program: {
        ...base,
        name: "  Imported Graph  ",
        physicsIds: ["dry-contact", "unknown-physics", "dry-contact"],
        finishIds: ["grain-boost", "unknown-finish"],
        tuning: {
          ...base.tuning,
          size: 999,
          wetness: -3,
          patternScale: 0,
        },
      },
    }));

    expect(parsed.name).toBe("Imported Graph");
    expect(parsed.physicsIds).toEqual(["dry-contact"]);
    expect(parsed.finishIds).toEqual(["grain-boost"]);
    expect(parsed.tuning.size).toBe(160);
    expect(parsed.tuning.wetness).toBe(0);
    expect(parsed.tuning.patternScale).toBe(0.25);
  });

  it("produces deterministic seeded variants without replacing the program identity", () => {
    const base = normalizeBrushStudioV5Draft({
      ...createDefaultBrushStudioV5Draft(),
      id: "stable-brush-id",
      seed: 42,
    });
    const first = randomizeBrushStudioV5Draft(base);
    const second = randomizeBrushStudioV5Draft(base);

    expect(first).toEqual(second);
    expect(first.id).toBe("stable-brush-id");
    expect(first.seed).toBe(43);
    expect(first.name).toContain("변형");
  });

  it("automatically attaches relief lighting to height-field brushes", () => {
    const source = normalizeBrushStudioV5Draft({
      ...createDefaultBrushStudioV5Draft(),
      materialId: "oil",
      physicsIds: ["height-relief"],
      finishIds: [],
    });
    const optimized = optimizeBrushStudioV5Draft(source);

    expect(optimized.finishIds).toContain("relief-lighting");
    expect(analyzeBrushStudioV5Draft(optimized).valid).toBe(true);
  });
});
