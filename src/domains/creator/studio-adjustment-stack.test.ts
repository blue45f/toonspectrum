import { describe, expect, it } from "vitest";

import {
  STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS,
  STUDIO_ADJUSTMENT_ENGINE_IDS,
  appendStudioAdjustmentEntry,
  createEmptyStudioAdjustmentStack,
  listEnabledStudioAdjustmentEngines,
  normalizeStudioAdjustmentStack,
  removeStudioAdjustmentEntry,
  reorderStudioAdjustmentEntry,
  setStudioAdjustmentEntryEnabled,
  studioAdjustmentEngineHasLivePreview,
  studioAdjustmentStackHasLivePreview,
  studioAdjustmentStackToFilterFields,
} from "./studio-adjustment-stack";

describe("studio adjustment stack", () => {
  it("normalizes corrupt stacks into a safe empty or clamped list", () => {
    expect(normalizeStudioAdjustmentStack(null)).toEqual(createEmptyStudioAdjustmentStack());
    const stack = normalizeStudioAdjustmentStack({
      entries: [
        { engine: "curves", enabled: true, params: { mid: 1.2 } },
        { engine: "not-real" },
        { engine: "blur", enabled: false, params: { radius: 3 } },
      ],
    });
    expect(stack.entries).toHaveLength(2);
    expect(stack.entries[0]?.engine).toBe("curves");
    expect(stack.entries[1]?.enabled).toBe(false);
  });

  it("appends, reorders, toggles and removes entries deterministically", () => {
    let stack = createEmptyStudioAdjustmentStack();
    stack = appendStudioAdjustmentEntry(stack, { engine: "levels", params: { black: 0 } });
    stack = appendStudioAdjustmentEntry(stack, { engine: "blur", params: { radius: 2 } });
    expect(stack.entries.map((e) => e.engine)).toEqual(["levels", "blur"]);

    stack = reorderStudioAdjustmentEntry(stack, 0, 1);
    expect(stack.entries.map((e) => e.engine)).toEqual(["blur", "levels"]);

    const blurId = stack.entries[0]!.id;
    stack = setStudioAdjustmentEntryEnabled(stack, blurId, false);
    expect(listEnabledStudioAdjustmentEngines(stack)).toEqual(["levels"]);

    stack = removeStudioAdjustmentEntry(stack, blurId);
    expect(stack.entries.map((e) => e.engine)).toEqual(["levels"]);
  });

  it("maps enabled stack entries onto flat filter fields for Konva preview", () => {
    let stack = createEmptyStudioAdjustmentStack();
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "brightness-contrast",
      params: { brightness: 0.2, contrast: 10 },
    });
    stack = appendStudioAdjustmentEntry(stack, { engine: "blur", params: { radius: 4 } });
    stack = appendStudioAdjustmentEntry(stack, { engine: "invert", params: {} });
    const fields = studioAdjustmentStackToFilterFields(stack);
    expect(fields.brightness).toBe(0.2);
    expect(fields.contrast).toBe(10);
    expect(fields.blur).toBe(4);
    expect(fields.invert).toBe(true);
  });

  it("maps gaussian and motion blur onto blurFx for live preview", () => {
    let stack = createEmptyStudioAdjustmentStack();
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "gaussian-blur",
      params: { radius: 10, strength: 80 },
    });
    let fields = studioAdjustmentStackToFilterFields(stack);
    expect(fields.blurFx).toEqual({
      type: "gaussian",
      strength: 80,
      radius: 10,
      angle: 0,
    });

    stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "motion-blur",
      params: { radius: 20, strength: 90, angle: 45 },
    });
    fields = studioAdjustmentStackToFilterFields(stack);
    expect(fields.blurFx).toEqual({
      type: "motion",
      strength: 90,
      radius: 20,
      angle: 45,
    });
  });

  it("only exposes the 4 engines with no dedicated live-preview panel as addable", () => {
    expect(STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS).toEqual([
      "curves",
      "color-balance",
      "channel-mixer",
      "gradient-map",
    ]);
    // Every addable engine must also be a recognized engine id (no drift between the two lists).
    for (const engine of STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS) {
      expect(STUDIO_ADJUSTMENT_ENGINE_IDS).toContain(engine);
    }
  });

  it("flags exactly the addable engines as having no live preview", () => {
    for (const engine of STUDIO_ADJUSTMENT_ENGINE_IDS) {
      const expected = !(STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS as readonly string[]).includes(engine);
      expect(studioAdjustmentEngineHasLivePreview(engine)).toBe(expected);
    }
  });

  it("studioAdjustmentStackHasLivePreview stays true for the 9 live engines, false for the 4 stack-only ones", () => {
    const liveStack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "brightness-contrast",
      params: { brightness: 0.1 },
    });
    expect(studioAdjustmentStackHasLivePreview(liveStack)).toBe(true);

    const deadStack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "channel-mixer",
      params: {},
    });
    expect(studioAdjustmentStackHasLivePreview(deadStack)).toBe(false);

    expect(studioAdjustmentStackHasLivePreview(createEmptyStudioAdjustmentStack())).toBe(false);
  });
});
