import { describe, expect, it } from "vitest";

import { extractStudioBg3dLtNormalEdges } from "./studio-bg3d-lt-normal-edges";
import { renderStudioBg3dLtLayers } from "./studio-bg3d-lt-render";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

function fixture() {
  const width = 8;
  const height = 6;
  const normalRgba = new Uint8Array(width * height * 4);
  const rgba = new Uint8Array(width * height * 4).fill(255);
  const depth = new Float32Array(width * height).fill(0.5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      normalRgba.set(x < 4 ? [128, 128, 255, 255] : [255, 128, 128, 255], (y * width + x) * 4);
    }
  }
  return { width, height, normalRgba, depth, rgba };
}

describe("LT geometry-normal creases", () => {
  it("uses the artist's crease angle and emits only one side of an equal-depth crease", () => {
    const input = fixture();
    const low = extractStudioBg3dLtNormalEdges({ ...input, creaseAngleDegrees: 30 });
    const high = extractStudioBg3dLtNormalEdges({ ...input, creaseAngleDegrees: 120 });
    expect(Array.from(low).filter(Boolean)).toHaveLength(input.height);
    expect(high.every((value) => value === 0)).toBe(true);
    for (let y = 0; y < input.height; y += 1) {
      expect(low[y * input.width + 3]).toBe(255);
      expect(low[y * input.width + 4]).toBe(0);
    }
  });

  it("does not create lines on constant normals, background, or behind an occlusion", () => {
    const input = fixture();
    for (let pixel = 0; pixel < input.depth.length; pixel += 1) {
      input.normalRgba.set([128, 128, 255, 255], pixel * 4);
    }
    expect(extractStudioBg3dLtNormalEdges({ ...input, creaseAngleDegrees: 0 }).some(Boolean)).toBe(false);
    const hidden = fixture();
    for (let y = 0; y < hidden.height; y += 1) {
      for (let x = 4; x < hidden.width; x += 1) hidden.depth[y * hidden.width + x] = 0.9;
    }
    expect(extractStudioBg3dLtNormalEdges({ ...hidden, creaseAngleDegrees: 30 }).some(Boolean)).toBe(false);
    const background = fixture();
    for (let pixel = 0; pixel < background.depth.length; pixel += 1) background.normalRgba[pixel * 4 + 3] = 0;
    expect(extractStudioBg3dLtNormalEdges({ ...background, creaseAngleDegrees: 30 }).some(Boolean)).toBe(false);
  });

  it("changes actual exported line pixels, while legacy no-normal input stays compatible", () => {
    const input = fixture();
    const before = input.normalRgba.slice();
    const settings = {
      line: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line, enabled: true, strength: 1,
        widthPx: 1, depthEnabled: true, depthStrength: 1, depthOutlineOnly: false,
        exteriorOutlineStrength: 0, textureLineEnabled: false, creaseAngleDegrees: 30 },
      tone: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone, mode: "none" as const },
    };
    const low = renderStudioBg3dLtLayers(input, settings);
    const high = renderStudioBg3dLtLayers(input, { ...settings, line: { ...settings.line, creaseAngleDegrees: 120 } });
    expect(low.layers.find((layer) => layer.role === "main-line")?.data.some(Boolean)).toBe(true);
    expect(high.layers).toEqual([]);
    const legacy = { width: input.width, height: input.height, rgba: input.rgba, depth: input.depth };
    expect(renderStudioBg3dLtLayers(legacy, settings).layers).toEqual([]);
    expect(input.normalRgba).toEqual(before);
    expect(renderStudioBg3dLtLayers(input, { ...settings, line: { ...settings.line, depthOutlineOnly: true } }).layers).toEqual([]);
  });

  it("rejects malformed or mismatched normal payloads and invalid angles", () => {
    const input = fixture();
    expect(() => extractStudioBg3dLtNormalEdges({ ...input, normalRgba: new Uint8Array(1), creaseAngleDegrees: 30 })).toThrow(TypeError);
    expect(() => extractStudioBg3dLtNormalEdges({ ...input, creaseAngleDegrees: Number.NaN })).toThrow(RangeError);
    expect(() => extractStudioBg3dLtNormalEdges({ ...input, width: 100_000, height: 100_000, creaseAngleDegrees: 30 })).toThrow(RangeError);
    input.depth[0] = Number.NaN;
    expect(() => extractStudioBg3dLtNormalEdges({ ...input, creaseAngleDegrees: 30 })).toThrow(RangeError);
  });
});
