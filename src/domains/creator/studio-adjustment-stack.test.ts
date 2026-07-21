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
  studioAdjustmentOperationToFilterFields,
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

  it("projects enabled entries as an ordered program instead of flattening their fields", () => {
    let stack = createEmptyStudioAdjustmentStack();
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "brightness-contrast",
      params: { brightness: 0.2, contrast: 10 },
    });
    stack = appendStudioAdjustmentEntry(stack, { engine: "blur", params: { radius: 4 } });
    stack = appendStudioAdjustmentEntry(stack, { engine: "invert", params: {} });
    const fields = studioAdjustmentStackToFilterFields(stack);
    expect(fields.smartFilterOperations?.map((entry) => entry.engine)).toEqual([
      "brightness-contrast",
      "blur",
      "invert",
    ]);
    expect(studioAdjustmentOperationToFilterFields(fields.smartFilterOperations![0]!))
      .toMatchObject({ brightness: 0.2, contrast: 10 });
    expect(studioAdjustmentOperationToFilterFields(fields.smartFilterOperations![1]!))
      .toMatchObject({ blur: 4 });
    expect(studioAdjustmentOperationToFilterFields(fields.smartFilterOperations![2]!))
      .toMatchObject({ invert: true });
  });

  it("retains duplicate engines and changes program order when the user reorders the stack", () => {
    let stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      id: "bright-a",
      engine: "brightness-contrast",
      params: { brightness: 0.1 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      id: "bright-b",
      engine: "brightness-contrast",
      params: { brightness: 0.3 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      id: "invert-a",
      engine: "invert",
      params: {},
    });

    expect(studioAdjustmentStackToFilterFields(stack).smartFilterOperations?.map((entry) => [
      entry.id,
      entry.engine,
    ])).toEqual([
      ["bright-a", "brightness-contrast"],
      ["bright-b", "brightness-contrast"],
      ["invert-a", "invert"],
    ]);

    const reordered = reorderStudioAdjustmentEntry(stack, 2, 0);
    expect(studioAdjustmentStackToFilterFields(reordered).smartFilterOperations?.map((entry) => entry.id))
      .toEqual(["invert-a", "bright-a", "bright-b"]);
  });

  it("maps gaussian and motion blur onto blurFx for live preview", () => {
    let stack = createEmptyStudioAdjustmentStack();
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "gaussian-blur",
      params: { radius: 10, strength: 80 },
    });
    let fields = studioAdjustmentOperationToFilterFields(
      studioAdjustmentStackToFilterFields(stack).smartFilterOperations![0]!,
    );
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
    fields = studioAdjustmentOperationToFilterFields(
      studioAdjustmentStackToFilterFields(stack).smartFilterOperations![0]!,
    );
    expect(fields.blurFx).toEqual({
      type: "motion",
      strength: 90,
      radius: 20,
      angle: 45,
    });
  });

  it("exposes every recognized engine as addable without catalog drift", () => {
    expect(STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS).toBe(STUDIO_ADJUSTMENT_ENGINE_IDS);
    expect(STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS).toEqual(expect.arrayContaining([
      "exposure",
      "unsharp-mask",
      "morphology",
      "offset",
      "custom-convolution",
      "clouds",
    ]));
  });

  it("reports live local preview for every engine", () => {
    for (const engine of STUDIO_ADJUSTMENT_ENGINE_IDS) {
      expect(studioAdjustmentEngineHasLivePreview(engine)).toBe(true);
    }
  });

  it("studioAdjustmentStackHasLivePreview is true for any enabled engine", () => {
    const liveStack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "brightness-contrast",
      params: { brightness: 0.1 },
    });
    expect(studioAdjustmentStackHasLivePreview(liveStack)).toBe(true);

    const objectStack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "channel-mixer",
      params: { preset: "mono-balanced" },
    });
    expect(studioAdjustmentStackHasLivePreview(objectStack)).toBe(true);

    expect(studioAdjustmentStackHasLivePreview(createEmptyStudioAdjustmentStack())).toBe(false);
  });

  it("projects formerly stack-only presets into real object filter fields", () => {
    let stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "curves",
      params: { preset: "soft-contrast" },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "color-balance",
      params: { preset: "cinematic" },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "channel-mixer",
      params: { preset: "mono-balanced" },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "gradient-map",
      params: { preset: "teal-orange" },
    });
    const operations = studioAdjustmentStackToFilterFields(stack).smartFilterOperations!;
    expect(studioAdjustmentOperationToFilterFields(operations[0]!).curve).toHaveLength(4);
    expect(studioAdjustmentOperationToFilterFields(operations[1]!).colorBalance?.shadows)
      .toEqual([-8, 2, 16]);
    expect(studioAdjustmentOperationToFilterFields(operations[2]!).channelMixer?.monochrome)
      .toBe(true);
    expect(studioAdjustmentOperationToFilterFields(operations[3]!).gradientMap?.stops)
      .toHaveLength(3);
  });

  it("projects the new bounded Worker filters without losing custom kernel values", () => {
    let stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "exposure",
      params: { exposure: 1.2, gamma: 0.9, offset: 0.05 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "unsharp-mask",
      params: { amount: 1.1, radius: 3, threshold: 12 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "morphology",
      params: { mode: "erode", radius: 2 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "offset",
      params: { x: -8, y: 4, edge: "wrap" },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "custom-convolution",
      params: { k0: -1, k4: 9, k8: -1, divisor: 2, bias: 4 },
    });
    stack = appendStudioAdjustmentEntry(stack, {
      engine: "clouds",
      params: { amount: 0.4, scale: 80, seed: 42, mode: "screen" },
    });
    const operations = studioAdjustmentStackToFilterFields(stack).smartFilterOperations!;
    expect(studioAdjustmentOperationToFilterFields(operations[0]!).exposureAdjustment)
      .toEqual({ exposure: 1.2, gamma: 0.9, offset: 0.05 });
    expect(studioAdjustmentOperationToFilterFields(operations[1]!).unsharpMask)
      .toEqual({ amount: 1.1, radius: 3, threshold: 12 });
    expect(studioAdjustmentOperationToFilterFields(operations[2]!).morphology)
      .toEqual({ mode: "erode", radius: 2 });
    expect(studioAdjustmentOperationToFilterFields(operations[3]!).pixelOffset)
      .toEqual({ x: -8, y: 4, edge: "wrap" });
    expect(studioAdjustmentOperationToFilterFields(operations[4]!).convolution).toEqual({
      kernel: [-1, 0, 0, 0, 9, 0, 0, 0, -1],
      divisor: 2,
      bias: 4,
    });
    expect(studioAdjustmentOperationToFilterFields(operations[5]!).clouds)
      .toEqual({ amount: 0.4, scale: 80, seed: 42, mode: "screen" });
  });
});
