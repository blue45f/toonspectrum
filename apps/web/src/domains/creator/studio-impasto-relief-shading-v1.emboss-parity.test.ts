import { describe, expect, it } from "vitest";
import { computeStudioImpastoReliefShading } from "./studio-impasto-relief-shading-v1";

describe("emboss scanline sampling parity", () => {
  it.each([
    [1, 1], [1, 7], [9, 1], [7, 9],
  ])("preserves clamped two-tap shading on a %sx%s tile", (width, height) => {
    for (const bytes of [false, true]) {
      const heights = bytes ? new Uint8Array(width * height) : new Float32Array(width * height);
      for (let i = 0; i < heights.length; i += 1) heights[i] = bytes ? (i * 71) % 256 : (i % 13) / 12;
      for (const lightDirection of [[0, -1, 1], [1, 0, 1], [-1, 1, 1], [1, -1, 2], [0, 0, 1]] as const) {
        const [lx, ly, lz] = lightDirection;
        const length = Math.sqrt(lx * lx + ly * ly + lz * lz);
        const planar = Math.hypot(lx / length, ly / length);
        const dx = planar <= 1e-9 ? 0 : Math.round(lx / length / planar) | 0;
        const dy = planar <= 1e-9 ? 0 : Math.round(ly / length / planar) | 0;
        const scale = (bytes ? 1 / 255 : 1) * 1.7;
        const gain = (4 / 7) * planar;
        const sample = (x: number, y: number): number =>
          heights[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]! * scale;
        const expected = new Float32Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const value = 1 + gain * (sample(x - dx, y - dy) - sample(x + dx, y + dy));
            expected[y * width + x] = Math.max(0, Math.min(4, value));
          }
        }
        const options = { width, height, quality: "emboss-2tap" as const, lightDirection, heightScale: 1.7 };
        expect(computeStudioImpastoReliefShading(heights, options)).toEqual(expected);
        const into = new Float32Array(width * height).fill(-1);
        const result = computeStudioImpastoReliefShading(heights, {
          ...options, into, region: { x: 0, y: 0, width: Math.ceil(width / 2), height: Math.ceil(height / 2) },
        });
        expect(result).toBe(into);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            expect(result[y * width + x]).toBe(x < Math.ceil(width / 2) && y < Math.ceil(height / 2) ? expected[y * width + x] : -1);
          }
        }
      }
    }
  });
});
