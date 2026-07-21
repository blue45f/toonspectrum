import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_TIP_COMBINED_ALPHA_MAP_BASE64_MAX_CHARS,
  STUDIO_BRUSH_TIP_LAYER_MAX_COUNT,
  composeNormalizedStudioBrushTipLayerDab,
  normalizeStudioBrushTipLayers,
  planStudioBrushTipComposition,
} from "./studio-brush-tip-composition";
import { studioBrushTipAlphaMapToBase64 } from "./studio-brush-tip-stamp";

describe("studio brush tip composition", () => {
  it("bounds and canonicalizes a three-tip contract", () => {
    const layers = normalizeStudioBrushTipLayers([
      {
        tip: { shape: "star", softness: 2 },
        scale: 9,
        opacity: -1,
        offsetX: 9,
        offsetY: -9,
        angle: 540,
        roundness: 9,
      },
      { tip: { shape: "grain" }, scale: 0 },
      { tip: { shape: "sponge" } },
    ]);
    expect(layers).toHaveLength(STUDIO_BRUSH_TIP_LAYER_MAX_COUNT);
    expect(layers[0]).toMatchObject({
      tip: { shape: "star", softness: 1 },
      scale: 4,
      opacity: 0,
      offsetX: 2,
      offsetY: -2,
      angle: -180,
      roundness: 2,
    });
    expect(layers[1]?.scale).toBe(0.1);
  });

  it("rotates tip-local offsets with the base dab and preserves the primary", () => {
    const dab = { x: 10, y: 20, size: 8, angle: 90, roundness: 0.8, opacity: 0.75, flow: 0.6 };
    const rawLayer = {
      tip: { shape: "star" as const, softness: 0.2, alphaMapBase64: null, alphaMapSize: 24 },
      scale: 0.5,
      opacity: 0.4,
      offsetX: 1,
      offsetY: 0,
      angle: 30,
      roundness: 0.5,
    };
    const composed = planStudioBrushTipComposition(
      dab,
      { shape: "hard" },
      [rawLayer]
    );
    expect(composed).toHaveLength(2);
    expect(composed[0]).toMatchObject({ role: "primary", layerIndex: -1 });
    expect(composed[0]?.dab).toMatchObject({ x: 10, y: 20, size: 8, angle: 90 });
    expect(composed[1]).toMatchObject({
      role: "layer",
      layerIndex: 0,
      tip: { shape: "star" },
      dab: {
        x: 10,
        y: 24,
        size: 4,
        angle: 120,
        roundness: 0.4,
        flow: 0.6,
      },
    });
    expect(composed[1]?.dab.opacity).toBeCloseTo(0.3, 12);
    const normalizedLayer = normalizeStudioBrushTipLayers([rawLayer])[0]!;
    expect(composeNormalizedStudioBrushTipLayerDab(dab, normalizedLayer)).toEqual(
      composed[1]?.dab
    );
  });

  it("drops only alpha maps that exceed the aggregate CRDT-safe budget", () => {
    const primary = studioBrushTipAlphaMapToBase64("grain", 0, 64);
    const secondary = studioBrushTipAlphaMapToBase64("star", 0, 64);
    const layers = normalizeStudioBrushTipLayers([
      { tip: { shape: "star", ...secondary } },
      { tip: { shape: "sponge", ...secondary } },
    ], { shape: "grain", ...primary });
    const encodedCharacters = primary.alphaMapBase64.length
      + layers.reduce((sum, layer) => sum + (layer.tip.alphaMapBase64?.length ?? 0), 0);
    expect(encodedCharacters).toBeLessThanOrEqual(
      STUDIO_BRUSH_TIP_COMBINED_ALPHA_MAP_BASE64_MAX_CHARS
    );
    expect(layers.every((layer) => layer.tip.alphaMapBase64 === null)).toBe(true);
    expect(layers.map((layer) => layer.tip.shape)).toEqual(["star", "sponge"]);
  });

  it("replays composition identically after JSON roundtrip", () => {
    const input = [{
      tip: { shape: "bristle" as const, softness: 0.3 },
      scale: 0.72,
      opacity: 0.55,
      offsetX: -0.4,
      offsetY: 0.25,
      angle: -17,
      roundness: 0.6,
    }];
    const dab = { x: 3, y: 9, size: 12, angle: 33, roundness: 0.7, opacity: 0.8, flow: 0.9 };
    expect(planStudioBrushTipComposition(dab, { shape: "round" }, input)).toEqual(
      planStudioBrushTipComposition(
        JSON.parse(JSON.stringify(dab)),
        { shape: "round" },
        JSON.parse(JSON.stringify(input))
      )
    );
  });
});
