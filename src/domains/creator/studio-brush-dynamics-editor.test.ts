import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";
import {
  findStudioBrushDynamicsMapping,
  removeStudioBrushDynamicsMapping,
  studioBrushDynamicsActiveMappingCount,
  studioBrushDynamicsPresetMatch,
  updateStudioBrushDynamicsJitter,
  updateStudioBrushDynamicsMapping,
  updateStudioBrushDynamicsPropertyBase,
  updateStudioBrushDynamicsRatio,
  updateStudioBrushDynamicsTaper,
  updateStudioBrushDynamicsTip,
} from "./studio-brush-dynamics-editor";

describe("studio brush dynamics editor", () => {
  it("recognizes detached presets and marks an edited recipe as custom", () => {
    const preset = studioBrushDynamicsPresetSettings("ink-particle");
    expect(studioBrushDynamicsPresetMatch(preset)).toBe("ink-particle");
    expect(studioBrushDynamicsPresetMatch(updateStudioBrushDynamicsRatio(preset, "spacing", 0.31))).toBeNull();
  });

  it("updates and removes one source mapping without mutating other properties", () => {
    const before = studioBrushDynamicsPresetSettings("airbrush");
    const next = updateStudioBrushDynamicsMapping(
      before,
      "width",
      "pressure",
      { from: 0.2, to: 1.8 },
      { source: "pressure", from: 0.3, to: 1.7 }
    );
    expect(findStudioBrushDynamicsMapping(next, "width", "pressure")).toMatchObject({ from: 0.2, to: 1.8 });
    expect(next.flow).toEqual(before.flow);
    expect(before.width.mappings[0]?.from).not.toBe(0.2);

    const removed = removeStudioBrushDynamicsMapping(next, "width", "pressure");
    expect(findStudioBrushDynamicsMapping(removed, "width", "pressure")).toBeNull();
  });

  it("edits bases, ratios and deterministic jitter through normalized settings", () => {
    let next = normalizeStudioBrushDynamicsSettings();
    next = updateStudioBrushDynamicsPropertyBase(next, "roundness", 0.25);
    next = updateStudioBrushDynamicsRatio(next, "spacing", 0.18);
    next = updateStudioBrushDynamicsRatio(next, "scatter", 0.4);
    next = updateStudioBrushDynamicsJitter(next, "width", 0.15);
    expect(next.roundness.base).toBe(0.25);
    expect(next.spacingRatio).toBe(0.18);
    expect(next.scatterRatio).toBe(0.4);
    expect(next.width.jitter).toEqual({ mode: "multiply", amount: 0.15 });
  });

  it("counts active mappings across every output property", () => {
    const preset = studioBrushDynamicsPresetSettings("dry-media");
    const expected = Object.values({
      width: preset.width,
      opacity: preset.opacity,
      flow: preset.flow,
      spacing: preset.spacing,
      scatter: preset.scatter,
      angle: preset.angle,
      roundness: preset.roundness,
    }).reduce((sum, property) => sum + property.mappings.length, 0);
    expect(studioBrushDynamicsActiveMappingCount(preset)).toBe(expected);
  });

  it("updates shared taper and PNG tip stamp settings through the editor helpers", () => {
    const base = studioBrushDynamicsPresetSettings("ink-particle");
    const tapered = updateStudioBrushDynamicsTaper(base, {
      enabled: true,
      startLength: 0.2,
      endLength: 0.3,
      minSizeRatio: 0.15,
    });
    expect(tapered.taper).toMatchObject({
      enabled: true,
      startLength: 0.2,
      endLength: 0.3,
      minSizeRatio: 0.15,
    });
    const tipped = updateStudioBrushDynamicsTip(tapered, { shape: "star", softness: 0.55 });
    expect(tipped.tip).toMatchObject({ shape: "star", softness: 0.55, alphaMapBase64: null });
    expect(studioBrushDynamicsPresetMatch(tipped)).toBeNull();
  });
});
