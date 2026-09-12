import { describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { BRUSH_PRESETS } from "../studio-brush";
import { readStudioCuttoonEditorSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import { mergeHydratedStudioToolOperationMemory, normalizeStudioToolOperationMemory, rememberStudioToolOperationSnapshot } from "../studio-tool-operation-memory";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import { studioBrushCatalogSelectionSnapshot, studioBrushSlotSelectionSnapshot } from "./studio-brush-selection-snapshot";
import { assignStudioBrushSlot, emptyStudioBrushSlots, normalizeStudioBrushSlotsState, rememberStudioBrushSlot } from "./studio-brush-slots";
import { studioMaterialBrushConfig } from "./studio-material-brush-runtime";

const material = () => createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));

describe("material brush selection transitions", () => {
  it.each(["pen", "brush", "standard-eraser"])("releases material authority when selecting built-in %s", (id) => {
    const preset = BRUSH_PRESETS.find((candidate) => candidate.id === id)!;
    const saved = material();
    const oil = { bristlePhysics: true, bristleLoadDynamics: false, impastoRelief: true };
    const current = { ...saved, enginePrograms: { ...saved.enginePrograms!, oil } };
    const selection = studioCoreBrushCatalogSelection(preset);
    const next = studioBrushCatalogSelectionSnapshot(current, selection, {
      brushId: id, strokeWidth: preset.defaultWidth, brushOpacity: preset.defaultOpacity, color: current.color,
    });
    expect(next.brushId).toBe(id);
    expect(next.enginePrograms?.material).toBeUndefined();
    expect(next.enginePrograms?.oil).toEqual(oil);
    expect(studioMaterialBrushConfig({
      points: [0, 0, 20, 20], stroke: next.color, strokeWidth: next.strokeWidth,
      brushEnginePrograms: next.enginePrograms ?? undefined,
    })).toBeNull();
    const initialMemory = normalizeStudioToolOperationMemory(null);
    const merged = mergeHydratedStudioToolOperationMemory({
      hydratedMemory: rememberStudioToolOperationSnapshot(initialMemory, "paint", saved),
      initialMemory, activeOperation: preset.operation, activeSnapshot: next,
      operationTransitionTouched: true,
    });
    expect(merged.memory[preset.operation].enginePrograms?.material).toBeUndefined();
    expect(merged.shouldApplyHydratedActiveSnapshot).toBe(false);
  });

  it("clears material for legacy recent slots, and recalls a material slot's own program after reload", () => {
    const saved = material();
    const legacy = { brushId: "pen", strokeWidth: 6, brushOpacity: 1 };
    expect(studioBrushSlotSelectionSnapshot(saved, legacy).enginePrograms).toBeNull();
    const slots = assignStudioBrushSlot(emptyStudioBrushSlots(), 0, {
      brushId: saved.brushId, strokeWidth: 240, brushOpacity: 0.01,
      brushDynamics: saved.brushDynamics, enginePrograms: saved.enginePrograms,
    });
    const reloaded = normalizeStudioBrushSlotsState(JSON.parse(JSON.stringify(slots)));
    const recalled = studioBrushSlotSelectionSnapshot(studioBrushSlotSelectionSnapshot(saved, legacy), reloaded.slots[0]!);
    expect(recalled.enginePrograms).toEqual(saved.enginePrograms);
    expect(recalled.strokeWidth).toBe(240);
    expect(recalled.brushOpacity).toBe(0.01);
    expect(studioBrushSlotSelectionSnapshot(saved, { ...legacy, enginePrograms: null }).enginePrograms).toBeNull();
  });

  it("keeps two material slots with the same base id and different pigments independently recallable", () => {
    const a = material();
    const b = createBrushStudioV6ProductBrush(createBrushStudioV6Program("mineral-bloom"));
    const shared = { brushId: "brush", strokeWidth: 24, brushOpacity: 0.5 };
    const slots = rememberStudioBrushSlot(rememberStudioBrushSlot(emptyStudioBrushSlots(), {
      ...shared, enginePrograms: a.enginePrograms,
    }), { ...shared, enginePrograms: b.enginePrograms });
    expect(slots.slots.filter(Boolean)).toHaveLength(2);
  });

  it("wires each host selection to its snapshot and captures authority before React setters", () => {
    const source = readStudioCuttoonEditorSource();
    for (const [name, next, helper] of [
      ["applyStudioBrushCatalogSelection", "applyBuiltInBrushPreset", "studioBrushCatalogSelectionSnapshot"],
      ["applyBrushSlot", "applyDynamicsPreset", "studioBrushSlotSelectionSnapshot"],
    ]) {
      const start = source.indexOf(`function ${name}(`);
      const block = source.slice(start, source.indexOf(`function ${next}(`, start));
      expect(block).toContain(helper);
      expect(block).toContain("setBrushEnginePrograms(snapshot.enginePrograms ?? null)");
      expect(block).toContain("toolOperationMemoryRef.current = rememberStudioToolOperationSnapshot(");
      expect(block.indexOf("currentBrushSnapshotRef.current = snapshot")).toBeGreaterThan(-1);
      expect(block.indexOf("currentBrushSnapshotRef.current = snapshot")).toBeLessThan(block.indexOf("setBrush("));
      expect(block.indexOf("toolOperationMemoryTouchedRef.current = true")).toBeLessThan(block.indexOf("setBrush("));
    }
  });
});
