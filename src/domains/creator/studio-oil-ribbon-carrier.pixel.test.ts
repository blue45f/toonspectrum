import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { planOilBrushDabs } from "./studio-fx-brush";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonPathData,
} from "./studio-oil-ribbon-carrier";

function luminance(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  const offset = (y * width + x) * 4;
  const red = pixels[offset] ?? 255;
  const green = pixels[offset + 1] ?? 255;
  const blue = pixels[offset + 2] ?? 255;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function meanLuminance(
  pixels: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  let sum = 0;
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      sum += luminance(pixels, width, x, y);
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

describe("Studio oil/acrylic ribbon raster crossing quality", () => {
  it("does not turn a sharp figure-eight self-crossing into an opaque bristle knot", async () => {
    const module = await import("@resvg/resvg-wasm");
    const require = createRequire(import.meta.url);
    await module.initWasm(
      await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
    );
    for (const baseWidth of [10, 18, 30]) {
      for (const strokeOpacity of [0.25, 0.55, 1]) {
        for (const seed of [5, 41, 97]) {
          const carrier = planStudioOilRibbonCarrier(planOilBrushDabs({
            points: [14, 14, 86, 86, 14, 86, 86, 14],
            pressures: [0.58, 0.58, 0.58, 0.58],
            baseWidth,
            seed,
          }));
          expect(carrier.body).not.toBeNull();

          const body = `<path d="${studioOilRibbonPathData(carrier.body!, true)}" fill="#bd6d32" fill-rule="nonzero" opacity="${carrier.bodyOpacity * strokeOpacity}"/>`;
          const bristles = carrier.bristleLanes.map((lane) => (
            `<path d="${studioOilRibbonPathData(lane)}" fill="none" stroke="#874116" stroke-width="${lane.lineWidth}" stroke-linecap="butt" stroke-linejoin="round" opacity="${lane.opacity * strokeOpacity}"/>`
          )).join("");
          const renderer = new module.Resvg(
            [
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">',
              '<rect width="100" height="100" fill="#fff"/>',
              body,
              `<g style="mix-blend-mode:multiply">${bristles}</g>`,
              "</svg>",
            ].join(""),
            {
              shapeRendering: 2,
              font: { loadSystemFonts: false },
            },
          );
          const rendered = renderer.render();
          try {
            const arm = meanLuminance(rendered.pixels, rendered.width, 31, 31, 2);
            const crossing = meanLuminance(
              rendered.pixels,
              rendered.width,
              50,
              50,
              2,
            );

            expect(
              Math.abs(crossing - arm),
              `width=${baseWidth}, opacity=${strokeOpacity}, seed=${seed}`,
            ).toBeLessThanOrEqual(8);
          } finally {
            rendered.free();
            renderer.free();
          }
        }
      }
    }
  });
});
