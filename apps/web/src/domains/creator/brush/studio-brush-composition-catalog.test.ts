import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_COMPOSITION_NODES,
  STUDIO_BRUSH_COMPOSITION_RECIPES,
  compileStudioBrushCompositionProgramSet,
  createStudioBrushCompositionBaseline,
  planStudioBrushComposition,
  resetStudioBrushCompositionProgramSet,
  studioBrushCompositionNodeById,
} from "./studio-brush-composition-catalog";
import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  normalizeStudioBrushEngineProgramSet,
  studioBrushEngineProgramSetFromComposition,
  studioBrushEngineProgramSetWithOil,
} from "./studio-brush-engine-program-set";

describe("Brush Studio V5 composition catalog", () => {
  it("keeps every node id unique and registered in its declared slot", () => {
    const ids = new Set<string>();
    for (const node of STUDIO_BRUSH_COMPOSITION_NODES) {
      expect(ids.has(node.id), node.id).toBe(false);
      ids.add(node.id);
      expect(STUDIO_BRUSH_COMPOSITION_SLOT_IDS).toContain(node.slot);
      expect(studioBrushCompositionNodeById(node.id)).toBe(node);
    }
    expect(ids.size).toBeGreaterThanOrEqual(70);
  });

  it("creates a complete, valid baseline for every representative render family", () => {
    for (const [brushId, family] of [
      ["pen", "pen"],
      ["gpen", "gpen"],
      ["fountain-pen", "calligraphy"],
      ["pencil", "pencil"],
      ["watercolor", "watercolor"],
      ["inkwash-pen", "watercolor"],
      ["oil--filbert-ribbon", "oil"],
      ["airbrush", "airbrush"],
      ["screentone", "screentone"],
    ] as const) {
      const baseline = createStudioBrushCompositionBaseline(brushId, family);
      expect(Object.keys(baseline), brushId).toHaveLength(STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length);
      const plan = planStudioBrushComposition({ brushId, family, composition: baseline });
      expect(plan.issues.filter((entry) => entry.severity === "error"), brushId).toEqual([]);
      expect(plan.canSave, brushId).toBe(true);
    }
  });

  it("keeps every curated recipe authority-valid for its intended material", () => {
    const families: Record<string, string> = {
      "clean-ink": "pen",
      "living-chroma": "watercolor",
      "mineral-wash": "watercolor",
      "natural-graphite": "pencil",
      "impasto-mixer": "oil",
      "dripping-neon": "watercolor",
      "foliage-flow": "stamp",
    };
    for (const recipe of STUDIO_BRUSH_COMPOSITION_RECIPES) {
      const family = families[recipe.id] ?? "pen";
      const plan = planStudioBrushComposition({
        brushId: recipe.id,
        family,
        composition: recipe.composition,
      });
      expect(plan.issues.filter((entry) => entry.severity === "error"), recipe.id).toEqual([]);
    }
  });

  it("compiles an Inkwash graph into the connected watercolor runtime program", () => {
    const recipe = STUDIO_BRUSH_COMPOSITION_RECIPES.find((entry) => entry.id === "living-chroma")!;
    const compiled = compileStudioBrushCompositionProgramSet({
      brushId: "inkwash-pen",
      family: "watercolor",
      current: null,
      composition: recipe.composition,
    });
    expect(compiled.composition).toEqual(recipe.composition);
    expect(compiled.watercolor).toEqual({ livingInkBakeProgramId: "sumi-flow-bake" });
  });

  it("compiles paper-fiber wet composition into the connected feather program", () => {
    const baseline = createStudioBrushCompositionBaseline("watercolor", "watercolor");
    const compiled = compileStudioBrushCompositionProgramSet({
      brushId: "watercolor",
      family: "watercolor",
      current: null,
      composition: {
        ...baseline,
        surface: "paper-fiber-field",
        physics: "wet-diffusion-webgpu",
        pigment: "spectral-wgsl",
      },
    });
    expect(compiled.watercolor).toEqual({ wetEdgeBloomProgramId: "fiber-feather" });
  });

  it("compiles impasto, reservoir and bristle choices into the oil program matrix", () => {
    const recipe = STUDIO_BRUSH_COMPOSITION_RECIPES.find((entry) => entry.id === "impasto-mixer")!;
    const compiled = compileStudioBrushCompositionProgramSet({
      brushId: "oil--filbert-ribbon",
      family: "oil",
      current: null,
      composition: recipe.composition,
    });
    expect(compiled.oil).toEqual({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });
  });

  it("reports hard authority conflicts instead of silently changing providers", () => {
    const baseline = createStudioBrushCompositionBaseline("watercolor", "watercolor");
    const plan = planStudioBrushComposition({
      brushId: "watercolor",
      family: "watercolor",
      composition: {
        ...baseline,
        pigment: "inkwash-optical-density",
        physics: "no-physics",
      },
    });
    expect(plan.canSave).toBe(false);
    expect(plan.issues.some((entry) => entry.id === "inkwash-authority" && entry.severity === "error"))
      .toBe(true);
  });

  it("computes combined GPL and private-grant rights closure", () => {
    const baseline = createStudioBrushCompositionBaseline("oil", "oil");
    const plan = planStudioBrushComposition({
      brushId: "oil",
      family: "oil",
      composition: {
        ...baseline,
        tip: "dual-tip-krita",
        pigment: "mixbox-lut",
      },
    });
    expect(plan.rights).toMatchObject({
      copyleft: true,
      privateGrant: true,
      label: "GPL·허가 혼합",
    });
  });

  it("normalizes and preserves future well-formed composition ids fail-closed", () => {
    const normalized = normalizeStudioBrushEngineProgramSet({
      version: 1,
      composition: {
        motion: "future-motion-v2",
        pigment: "UPPER",
        physics: "future-physics-v4",
      },
    });
    expect(normalized?.composition).toEqual({
      motion: "future-motion-v2",
      physics: "future-physics-v4",
    });
    const plan = planStudioBrushComposition({
      brushId: "pen",
      family: "pen",
      composition: normalized?.composition,
    });
    expect(plan.canSave).toBe(false);
    expect(plan.issues.some((entry) => entry.id === "unknown-motion")).toBe(true);
  });

  it("preserves unrelated program overrides while adding and resetting composition", () => {
    const oil = studioBrushEngineProgramSetWithOil(
      studioBrushEngineProgramSetFromComposition(
        createStudioBrushCompositionBaseline("pen", "pen"),
      ),
      { bristlePhysics: false, bristleLoadDynamics: true, impastoRelief: true },
    );
    expect(oil.composition).toBeDefined();
    const reset = resetStudioBrushCompositionProgramSet({ family: "pen", current: oil });
    expect(reset).toEqual({
      version: 1,
      oil: { bristlePhysics: false, bristleLoadDynamics: true, impastoRelief: true },
    });
  });
});
