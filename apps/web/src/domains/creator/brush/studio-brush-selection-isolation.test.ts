import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "../studio-brush";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import { resolveStudioBrushRuntimeProgramSet } from "./studio-brush-composition-runtime";
import { normalizeStudioBrushEngineProgramSet, studioOilProgramSetForBrush } from "./studio-brush-engine-program-set";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import { studioBrushCatalogSelectionSnapshot, studioBrushSlotSelectionSnapshot } from "./studio-brush-selection-snapshot";

import type { StudioBrushSnapshot } from "./studio-brush-library";

const previousPrograms = normalizeStudioBrushEngineProgramSet({
  version: 1,
  oil: { bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false },
  watercolor: { wetEdgeBloomProgramId: "fiber-feather" },
  composition: { physics: "no-physics", pickup: "no-pickup", deposition: "loaded-paint" },
})!;
const dirty: StudioBrushSnapshot = { ...DEFAULT_STUDIO_BRUSH_SNAPSHOT, enginePrograms: previousPrograms };

function select(current: StudioBrushSnapshot, id: string) {
  const preset = BRUSH_PRESETS.find((entry) => entry.id === id)!;
  expect(preset).toBeDefined();
  return studioBrushCatalogSelectionSnapshot(current, studioCoreBrushCatalogSelection(preset), {
    brushId: preset.id, strokeWidth: preset.defaultWidth,
    brushOpacity: preset.defaultOpacity, color: current.color,
  });
}

describe("selected brush execution does not inherit another brush's programs", () => {
  it.each(BRUSH_PRESETS.map((preset) => [preset.id]))("selects %s with its own engine baseline", (id) => {
    const pristine = select(DEFAULT_STUDIO_BRUSH_SNAPSHOT, id);
    const afterAnotherBrush = select(dirty, id);
    expect(afterAnotherBrush.enginePrograms).toEqual(pristine.enginePrograms);
    expect(resolveStudioBrushRuntimeProgramSet(id, afterAnotherBrush.enginePrograms))
      .toEqual(resolveStudioBrushRuntimeProgramSet(id, pristine.enginePrograms));
  });

  it("cannot disable oil physics through an unrelated preceding composition", () => {
    const next = select(dirty, "oil");
    const runtime = resolveStudioBrushRuntimeProgramSet(next.brushId, next.enginePrograms);
    expect(runtime?.oil ?? studioOilProgramSetForBrush(next.brushId))
      .toEqual(studioOilProgramSetForBrush("oil"));
  });

  it.each([undefined, null])("uses the slot's baseline when programs are %s", (enginePrograms) => {
    const slot = { brushId: "oil", strokeWidth: 24, brushOpacity: 0.7, enginePrograms };
    expect(studioBrushSlotSelectionSnapshot(dirty, slot).enginePrograms).toBeNull();
  });

  it("keeps an explicit slot program and never mutates either source", () => {
    const slot = { brushId: "oil", strokeWidth: 24, brushOpacity: 0.7, enginePrograms: previousPrograms };
    const before = JSON.stringify({ dirty, slot });
    const next = studioBrushSlotSelectionSnapshot(dirty, slot);
    expect(next.enginePrograms).toEqual(previousPrograms);
    expect(JSON.stringify({ dirty, slot })).toBe(before);
  });
  it("is independent of selection order while preserving already captured program data", () => {
    const before = JSON.stringify(dirty);
    const a = select(DEFAULT_STUDIO_BRUSH_SNAPSHOT, "oil");
    const b = select(dirty, "pen");
    const again = select(b, "oil");
    expect(again).toEqual(a);
    expect(JSON.stringify(dirty)).toBe(before);
    expect(resolveStudioBrushRuntimeProgramSet("oil", previousPrograms)?.oil)
      .toEqual(previousPrograms.oil);
  });

  it("preserves only the explicit incoming catalogue receipt", () => {
    const preset = BRUSH_PRESETS.find((entry) => entry.id === "oil")!;
    const selection = { ...studioCoreBrushCatalogSelection(preset), enginePrograms: previousPrograms };
    const next = studioBrushCatalogSelectionSnapshot(DEFAULT_STUDIO_BRUSH_SNAPSHOT, selection, {
      brushId: "oil", strokeWidth: 23, brushOpacity: 0.4, color: "#123456",
    });
    expect(next.enginePrograms).toEqual(previousPrograms);
    expect(next.strokeWidth).toBe(23);
    expect(next.brushOpacity).toBe(0.4);
    expect(next.color).toBe("#123456");
    expect(next.pressureCurve).toBe(DEFAULT_STUDIO_BRUSH_SNAPSHOT.pressureCurve);
  });
});
