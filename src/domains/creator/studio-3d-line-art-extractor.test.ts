import { describe, expect, it } from "vitest";

import { extractStudio3DLineArt } from "./studio-3d-line-art-extractor";

describe("extractStudio3DLineArt", () => {
  it("detects edge boundary between black and white blocks", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8Array(width * height * 4);

    // Left half white, right half black
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const val = x < 5 ? 255 : 0;
        pixels[idx] = val;
        pixels[idx + 1] = val;
        pixels[idx + 2] = val;
        pixels[idx + 3] = 255;
      }
    }

    const result = extractStudio3DLineArt(pixels, width, height, { threshold: 30 });
    expect(result.linePixelCount).toBeGreaterThan(0);
    // Vertical line near x=4, y=5 should be detected as edge line
    const edgePixelAlpha = result.rgba[(5 * width + 4) * 4 + 3];
    expect(edgePixelAlpha).toBe(255);
  });
});
