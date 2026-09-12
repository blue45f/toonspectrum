import { describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { parseStudioAutosave, serializeStudioAutosave } from "../studio-autosave";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { normalizeStudioToolOperationMemory, rememberStudioToolOperationSnapshot } from "../studio-tool-operation-memory";
import { brushMatchesSnapshot, importBrushFromJson, writeBrushJson } from "./studio-brush-library";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

describe("saved material brush preservation", () => {
  it("exports and imports the complete material program and produces the same marks", () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
    const imported = importBrushFromJson(writeBrushJson(saved)).brush;
    expect(imported.enginePrograms).toEqual(saved.enginePrograms);
    expect(brushMatchesSnapshot(imported, saved)).toBe(true);
    const stroke = { points: [10, 20, 30, 38, 60, 45], pressures: [0.4, 0.7, 0.3], stroke: saved.color, strokeWidth: saved.strokeWidth };
    expect(planStudioMaterialBrush({ ...stroke, brushEnginePrograms: imported.enginePrograms! }))
      .toEqual(planStudioMaterialBrush({ ...stroke, brushEnginePrograms: saved.enginePrograms! }));
  });

  it("preserves legacy oil, watercolor and composition programs in the same export format", () => {
    const base = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    const enginePrograms = { version: 1 as const,
      oil: { bristlePhysics: true, bristleLoadDynamics: false, impastoRelief: true },
      watercolor: { wetEdgeBloomProgramId: "fiber-feather" },
      composition: { physics: "bristle-webgpu" },
    };
    expect(importBrushFromJson(writeBrushJson({ ...base, enginePrograms })).brush.enginePrograms).toEqual(enginePrograms);
  });

  it("recognizes material-only edits and removing material as changes to the saved brush", () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
    const current = saved.enginePrograms!;
    expect(brushMatchesSnapshot(saved, { ...saved, enginePrograms: {
      ...current, material: { ...current.material!, tuning: { ...current.material!.tuning, reservoir: 0.12 } },
    } })).toBe(false);
    expect(brushMatchesSnapshot(saved, { ...saved, enginePrograms: null })).toBe(false);
    expect(brushMatchesSnapshot(saved, { ...saved, enginePrograms: JSON.parse(JSON.stringify(current)) })).toBe(true);
  });

  it("preserves material strokes through project export and autosave recovery", () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("wax-resist"));
    const element = { id: "material-stroke", type: "draw", mode: "pen", brush: "brush", points: [10, 20, 30, 40],
      stroke: saved.color, strokeWidth: saved.strokeWidth, brushEnginePrograms: saved.enginePrograms };
    const project = { version: 2 as const, title: "Material", pagesList: [{ id: "page", elements: [element], bg: "#fff", bgGrad: null, canvasH: 900 }] };
    const reopened = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(project)));
    expect(reopened.pagesList[0]!.elements[0]).toEqual(element);
    const recovered = parseStudioAutosave(serializeStudioAutosave({ ...project, savedAt: "2026-09-12T00:00:00.000Z" }));
    expect(recovered?.pagesList?.[0]?.elements[0]).toEqual(element);
  });

  it("keeps paint material independent of eraser settings through tool memory reload", () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("mineral-bloom"));
    let memory = normalizeStudioToolOperationMemory(null);
    memory = rememberStudioToolOperationSnapshot(memory, "paint", saved);
    memory = rememberStudioToolOperationSnapshot(memory, "erase", { ...memory.erase, strokeWidth: 52 });
    const reloaded = normalizeStudioToolOperationMemory(JSON.parse(JSON.stringify(memory)));
    expect(reloaded.paint.enginePrograms).toEqual(saved.enginePrograms);
    expect(reloaded.erase.enginePrograms).toBeNull();
    expect(reloaded.erase.strokeWidth).toBe(52);
  });
});
