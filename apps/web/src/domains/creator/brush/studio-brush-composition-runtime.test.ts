import { describe, expect, it } from "vitest";

import { createStudioBrushCompositionBaseline } from "./studio-brush-composition-catalog";
import {
  compileStudioBrushCompositionRuntimeProgramSet,
  constrainStudioBrushCompositionToRuntime,
  isStudioBrushCompositionRuntimeSelectable,
  planStudioBrushCompositionRuntime,
  resolveStudioBrushRuntimeProgramSet,
} from "./studio-brush-composition-runtime";

describe("Brush Studio composition product runtime", () => {
  it("exposes only fields current product renderers actually consume", () => {
    expect(isStudioBrushCompositionRuntimeSelectable("oil", "physics", "bristle-webgpu")).toBe(true);
    expect(isStudioBrushCompositionRuntimeSelectable("oil", "carrier", "krita-hairy-carrier")).toBe(false);
    expect(isStudioBrushCompositionRuntimeSelectable("watercolor", "surface", "paper-fiber-field")).toBe(true);
    expect(isStudioBrushCompositionRuntimeSelectable("pen", "pattern", "kaleido-symmetry")).toBe(false);
  });

  it("does not collapse unavailable providers into unrelated oil booleans", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const compiled = compileStudioBrushCompositionRuntimeProgramSet({
      brushId: "oil--filbert-ribbon",
      family: "oil",
      current: {
        version: 1,
        oil: { bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: true },
      },
      composition: {
        ...baseline,
        carrier: "krita-hairy-carrier",
        tip: "normal-map-tip",
        pickup: "pigment-painter-reservoir",
        physics: "no-physics",
      },
    });
    expect(compiled.composition).toMatchObject({
      carrier: "krita-hairy-carrier",
      tip: "normal-map-tip",
      pickup: "pigment-painter-reservoir",
      physics: "no-physics",
    });
    expect(compiled.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: false,
      impastoRelief: false,
    });
  });

  it("maps supported oil authorities into visible runtime programs", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const compiled = compileStudioBrushCompositionRuntimeProgramSet({
      brushId: "oil--filbert-ribbon",
      family: "oil",
      composition: {
        ...baseline,
        deposition: "height-paint",
        pickup: "simple-reservoir",
        physics: "bristle-webgpu",
      },
    });
    expect(compiled.oil).toEqual({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });
  });

  it("recompiles persisted graphs at the render boundary and removes stale overrides", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const resolved = resolveStudioBrushRuntimeProgramSet("oil--filbert-ribbon", {
      version: 1,
      oil: { bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: true },
      composition: {
        ...baseline,
        deposition: "loaded-paint",
        pickup: "no-pickup",
        physics: "no-physics",
      },
    });
    expect(resolved?.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: false,
      impastoRelief: false,
    });
  });

  it("constrains UI recipes without destroying unavailable metadata", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const constrained = constrainStudioBrushCompositionToRuntime({
      family: "oil",
      current: { ...baseline, pigment: "open-km-wgsl" },
      requested: { ...baseline, pigment: "mixbox-lut", pickup: "simple-reservoir" },
    });
    expect(constrained.pigment).toBe("open-km-wgsl");
    expect(constrained.pickup).toBe("simple-reservoir");
    const plan = planStudioBrushCompositionRuntime("oil", constrained);
    expect(plan.connectedSelections.map(({ slot }) => slot).sort()).toEqual([
      "deposition",
      "physics",
      "pickup",
    ]);
    expect(plan.unavailableSelections.some(({ slot }) => slot === "pigment")).toBe(true);
  });
});
