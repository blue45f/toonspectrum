import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { parseStudioAutosave, serializeStudioAutosave } from "../studio-autosave";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { normalizeStudioToolOperationMemory, rememberStudioToolOperationSnapshot } from "../studio-tool-operation-memory";
import { brushMatchesSnapshot, importBrushFromJson, normalizeStoredBrush, sanitizeBrushSnapshot, writeBrushJson } from "./studio-brush-library";
import { parseStudioToolOperationMemory, serializeStudioToolOperationMemory } from "../studio-tool-operation-memory-sqlite";
import { planStudioMaterialBrush, studioMaterialBrushConfig } from "./studio-material-brush-runtime";

describe("saved material brush preservation", () => {
  it.each([[1, 0.01], [240, 0.01], [240, 1]])("retains material size %s and opacity %s through save, JSON, tool memory and runtime", (size, opacity) => {
    const program = createBrushStudioV6Program("oil-hair-mixer");
    const saved = createBrushStudioV6ProductBrush({ ...program, tuning: { ...program.tuning, size, opacity } });
    const imported = importBrushFromJson(writeBrushJson(saved)).brush;
    const stored = normalizeStoredBrush(JSON.parse(JSON.stringify(imported)))!;
    const memory = rememberStudioToolOperationSnapshot(normalizeStudioToolOperationMemory(null), "paint", stored);
    const reopened = parseStudioToolOperationMemory(serializeStudioToolOperationMemory(memory)).memory.paint;
    for (const snapshot of [saved, imported, stored, reopened]) {
      expect(snapshot.strokeWidth).toBe(size);
      expect(snapshot.brushOpacity).toBe(opacity);
      expect(studioMaterialBrushConfig({
        points: [0, 0, 10, 10], stroke: snapshot.color, strokeWidth: snapshot.strokeWidth,
        opacity: snapshot.brushOpacity, brushEnginePrograms: snapshot.enginePrograms!,
      })?.tuning).toMatchObject({ size, opacity });
    }
  });

  it.each(BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.id))("exports and imports %s without changing the material renderer or marks", (recipe) => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program(recipe));
    const { brush: imported, adjustedFields } = importBrushFromJson(writeBrushJson(saved));
    expect(adjustedFields).toEqual([]);
    expect(imported.enginePrograms).toEqual(saved.enginePrograms);
    expect(brushMatchesSnapshot(imported, saved)).toBe(true);
    const stroke = { points: [10, 20, 30, 38, 60, 45], pressures: [0.4, 0.7, 0.3], stroke: saved.color, strokeWidth: saved.strokeWidth };
    expect(planStudioMaterialBrush({ ...stroke, brushEnginePrograms: imported.enginePrograms! }))
      .toEqual(planStudioMaterialBrush({ ...stroke, brushEnginePrograms: saved.enginePrograms! }));
  });

  it.each([
    ["future program set", { version: 2 }],
    ["malformed program set", "material"],
    ["missing program version", {}],
    ["future material kernel", { version: 1, material: { version: 2 } }],
    ["malformed material", { version: 1, material: { version: 1, seed: 12 } }],
    ["malformed nested oil", { version: 1, oil: { bristlePhysics: "true" } }],
    ["discarded unknown extension", { version: 1, nextRenderer: {} }],
  ])("rejects %s at public import instead of returning a changed renderer", (_label, enginePrograms) => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
    const exported = JSON.parse(writeBrushJson(saved));
    exported.enginePrograms = enginePrograms;
    const text = JSON.stringify(exported);
    expect(sanitizeBrushSnapshot(exported).adjustedFields).toContain("enginePrograms");
    expect(() => importBrushFromJson(text)).toThrow(/브러시 엔진 설정을 그대로 복원할 수 없어 가져오지 않았어요/u);
    expect(() => importBrushFromJson(text)).toThrow(/최신 스튜디오.*원본 브러시를 다시 내보내/u);
  });

  it("keeps valid legacy JSON without engine programs importable", () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("clean-ink"));
    const exported = JSON.parse(writeBrushJson({ ...saved, enginePrograms: null }));
    delete exported.enginePrograms;
    const { brush: imported, adjustedFields } = importBrushFromJson(JSON.stringify(exported));
    expect(imported.enginePrograms).toBeNull();
    expect(adjustedFields).toEqual([]);
  });

  it.each([{}, { bristlePhysics: true }])("accepts older oil switches with additive false defaults: %j", (oil) => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("clean-ink"));
    const exported = JSON.parse(writeBrushJson({ ...saved, enginePrograms: null }));
    exported.enginePrograms = { version: 1, oil };
    const { brush: imported, adjustedFields } = importBrushFromJson(JSON.stringify(exported));
    expect(adjustedFields).toEqual([]);
    expect(imported.enginePrograms).toEqual({ version: 1, oil: { bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false, ...oil } });
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
    expect(recovered?.pagesList?.[0]?.elements?.[0]).toEqual(element);
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
