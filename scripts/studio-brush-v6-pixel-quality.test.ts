import { describe, expect, it } from "vitest";

import { brushV6InkDistance, brushV6InkField, brushV6InkStatistics } from "./studio-brush-v6-pixel-quality";

describe("V6 material pixel comparison", () => {
  it("does not count a different paper texture as a painted brush", () => {
    const roughPaper = new Uint8ClampedArray([240, 230, 220, 255, 100, 95, 90, 255]);
    const blank = brushV6InkField(roughPaper.slice(), roughPaper);
    expect(brushV6InkStatistics(blank)).toEqual({ paintedPixels: 0, inkMass: 0 });
  });

  it("rejects an opacity-only duplicate while preserving spatial material differences", () => {
    const first = new Float32Array([0, 0.2, 0.4, 0]);
    const opacityVariant = new Float32Array([0, 0.1, 0.2, 0]);
    const textured = new Float32Array([0.2, 0, 0.4, 0]);
    expect(brushV6InkDistance(first, opacityVariant)).toBe(0);
    expect(brushV6InkDistance(first, textured)).toBeCloseTo(1 / 3);
    expect(brushV6InkDistance(first, textured)).toBe(brushV6InkDistance(textured, first));
  });

  it("detects light pigment and alpha removal and rejects mismatched buffers", () => {
    const paper = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const painted = new Uint8ClampedArray([200, 200, 200, 255, 100, 100, 100, 100]);
    expect(brushV6InkStatistics(brushV6InkField(painted, paper)).paintedPixels).toBe(2);
    expect(() => brushV6InkField(painted, paper.slice(1))).toThrow("matching RGBA");
    expect(() => brushV6InkDistance(new Float32Array(1), new Float32Array(2))).toThrow("matching dimensions");
  });
});
