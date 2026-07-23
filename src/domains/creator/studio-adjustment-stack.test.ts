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
  studioAdjustmentDefaultParams,
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

  it("maps gaussian, motion, spin and zoom blur onto distinct blurFx modes", () => {
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

    stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "spin-blur",
      params: { radius: 16, strength: 75 },
    });
    fields = studioAdjustmentOperationToFilterFields(
      studioAdjustmentStackToFilterFields(stack).smartFilterOperations![0]!,
    );
    expect(fields.blurFx).toEqual({ type: "spin", strength: 75, radius: 16, angle: 0 });

    stack = appendStudioAdjustmentEntry(createEmptyStudioAdjustmentStack(), {
      engine: "zoom-blur",
      params: { radius: 24, strength: 65 },
    });
    fields = studioAdjustmentOperationToFilterFields(
      studioAdjustmentStackToFilterFields(stack).smartFilterOperations![0]!,
    );
    expect(fields.blurFx).toEqual({ type: "zoom", strength: 65, radius: 24, angle: 0 });
  });

  it("projects every added commercial filter into a real bounded pixel field", () => {
    const project = (
      engine: Parameters<typeof studioAdjustmentDefaultParams>[0],
      params = studioAdjustmentDefaultParams(engine),
    ) => studioAdjustmentOperationToFilterFields({
      id: `test-${engine}`,
      engine,
      enabled: true,
      params,
    });

    expect(project("pixelate")).toMatchObject({ pixelate: 8 });
    expect(project("posterize")).toMatchObject({ posterize: 5 });
    expect(project("ink-threshold")).toMatchObject({ inkThreshold: 0.5 });
    expect(project("line-extraction")).toMatchObject({ lineart: true });
    expect(project("screentone")).toMatchObject({ screentone: true });
    expect(project("chromatic-aberration")).toMatchObject({ chromatic: 4 });
    expect(project("grayscale")).toMatchObject({ grayscale: true });
    expect(project("sepia")).toMatchObject({ sepia: true });
    expect(project("color-halftone").halftone).toEqual({
      dotSize: 4,
      angle: 15,
      mode: "cmyk",
      strength: 100,
    });
    expect(project("edge-detect").stylize?.type).toBe("findEdges");
    expect(project("emboss").stylize?.type).toBe("emboss");
    expect(project("solarize").stylize?.type).toBe("solarize");
    expect(project("oil-paint").stylize?.type).toBe("oilPaint");
    expect(project("smart-sharpen").detail?.type).toBe("smartSharpen");
    expect(project("median-despeckle").detail?.type).toBe("median");
    expect(project("high-pass").convolution).toEqual({
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      divisor: 1,
      bias: 128,
    });
    expect(project("shadow-highlight").shadowHighlight).toEqual({
      shadows: 35,
      shadowsWidth: 50,
      highlights: 20,
      highlightsWidth: 50,
      midtoneContrast: 0,
    });
    expect(
      project("shadow-highlight", { shadows: 60, highlights: 40, midtoneContrast: -15 }).shadowHighlight
    ).toEqual({
      shadows: 60,
      shadowsWidth: 50,
      highlights: 40,
      highlightsWidth: 50,
      midtoneContrast: -15,
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
      "spin-blur",
      "zoom-blur",
      "pixelate",
      "posterize",
      "ink-threshold",
      "line-extraction",
      "screentone",
      "color-halftone",
      "chromatic-aberration",
      "grayscale",
      "sepia",
      "edge-detect",
      "emboss",
      "high-pass",
      "median-despeckle",
      "surface-blur",
      "crystal-mosaic",
      "pencil-sketch",
      "crosshatch",
      "ordered-dither",
      "glowing-edges",
      "cutout",
      "retro-film",
      "watercolor",
      "diffuse-glow",
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
