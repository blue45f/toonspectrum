import { describe, expect, it } from "vitest";

import {
  normalizeStudioBrushColorDynamicsSettings,
  normalizeStudioBrushGrainSettings,
  resolveNormalizedStudioBrushGrainAlphaMultiplier,
  resolveNormalizedStudioBrushGrainAlphaMultiplierAt,
  resolveStudioBrushDabColor,
  resolveStudioBrushGrainAlphaMultiplier,
  studioBrushColorDynamicsIsActive,
  studioBrushGrainIsActive,
} from "./studio-brush-material-dynamics";

describe("studio brush material dynamics", () => {
  it("normalizes corrupt colour/grain snapshots into finite bounded contracts", () => {
    expect(normalizeStudioBrushColorDynamicsSettings({
      backgroundColor: " #AbC ",
      foregroundBackgroundMix: 4,
      foregroundBackgroundJitter: -2,
      hueJitter: 900,
      saturationJitter: Number.NaN,
      valueJitter: 3,
    })).toEqual({
      backgroundColor: "#aabbcc",
      foregroundBackgroundMix: 1,
      foregroundBackgroundJitter: 0,
      hueJitter: 180,
      saturationJitter: 0,
      valueJitter: 1,
    });
    expect(normalizeStudioBrushGrainSettings({
      space: "future-space",
      amount: 8,
      scale: 0,
      contrast: -1,
      seed: Number.POSITIVE_INFINITY,
    })).toEqual({
      space: "canvas-fixed",
      amount: 1,
      scale: 0.25,
      contrast: 0,
      seed: 1,
    });
  });

  it("mixes foreground/background exactly before deterministic HSV variation", () => {
    const settings = {
      backgroundColor: "#0000ff",
      foregroundBackgroundMix: 0.5,
    };
    expect(resolveStudioBrushDabColor("#ff0000", 0, 19, settings)).toBe("#800080");
    expect(resolveStudioBrushDabColor("currentColor", 0, 19, settings)).toBe("currentColor");
  });

  it("replays per-dab HSV jitter deterministically without Math.random", () => {
    const settings = {
      hueJitter: 90,
      saturationJitter: 0.35,
      valueJitter: 0.2,
    };
    const first = Array.from({ length: 12 }, (_, index) => (
      resolveStudioBrushDabColor("#4f8ad9", index, 0x1234_abcd, settings)
    ));
    const replay = Array.from({ length: 12 }, (_, index) => (
      resolveStudioBrushDabColor(
        "#4f8ad9",
        index,
        0x1234_abcd,
        JSON.parse(JSON.stringify(settings))
      )
    ));
    expect(replay).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(4);
    expect(studioBrushColorDynamicsIsActive(settings)).toBe(true);
    expect(studioBrushColorDynamicsIsActive({})).toBe(false);
  });

  it("distinguishes canvas-fixed and stroke-fixed grain under translation", () => {
    const common = { amount: 0.8, scale: 5.5, contrast: 0.65, seed: 73 };
    const sample = {
      x: 13.25,
      y: 27.75,
      strokeOriginX: 10,
      strokeOriginY: 20,
      strokeSeed: 991,
    };
    const translated = {
      ...sample,
      x: sample.x + 100,
      y: sample.y - 40,
      strokeOriginX: sample.strokeOriginX + 100,
      strokeOriginY: sample.strokeOriginY - 40,
    };
    const strokeFixed = { ...common, space: "stroke-fixed" as const };
    const canvasFixed = { ...common, space: "canvas-fixed" as const };
    expect(resolveStudioBrushGrainAlphaMultiplier(translated, strokeFixed)).toBeCloseTo(
      resolveStudioBrushGrainAlphaMultiplier(sample, strokeFixed),
      12
    );
    expect(resolveStudioBrushGrainAlphaMultiplier(translated, canvasFixed)).not.toBeCloseTo(
      resolveStudioBrushGrainAlphaMultiplier(sample, canvasFixed),
      5
    );
  });

  it("keeps legacy grain as an exact identity", () => {
    expect(studioBrushGrainIsActive({ amount: 0 })).toBe(false);
    expect(resolveStudioBrushGrainAlphaMultiplier({
      x: 10,
      y: 20,
      strokeSeed: 4,
    }, { amount: 0 })).toBe(1);
  });

  it("keeps the allocation-free grain renderer path exactly equal to the object API", () => {
    for (const space of ["canvas-fixed", "stroke-fixed"] as const) {
      const settings = normalizeStudioBrushGrainSettings({
        space,
        amount: 0.73,
        scale: 7.1,
        contrast: 0.56,
        seed: 917,
      });
      for (const sample of [
        { x: 0, y: 0, strokeOriginX: 0, strokeOriginY: 0, strokeSeed: 1 },
        { x: 13.25, y: -8.75, strokeOriginX: 3, strokeOriginY: -2, strokeSeed: 991 },
        { x: Number.NaN, y: Number.POSITIVE_INFINITY, strokeSeed: Number.NaN },
      ]) {
        expect(resolveNormalizedStudioBrushGrainAlphaMultiplierAt(
          sample.x,
          sample.y,
          sample.strokeOriginX,
          sample.strokeOriginY,
          sample.strokeSeed,
          settings
        )).toBe(resolveNormalizedStudioBrushGrainAlphaMultiplier(sample, settings));
      }
    }
    const disabled = normalizeStudioBrushGrainSettings({ amount: 0 });
    expect(resolveNormalizedStudioBrushGrainAlphaMultiplierAt(
      Number.NaN,
      Number.NaN,
      undefined,
      undefined,
      Number.NaN,
      disabled
    )).toBe(1);
  });
});
