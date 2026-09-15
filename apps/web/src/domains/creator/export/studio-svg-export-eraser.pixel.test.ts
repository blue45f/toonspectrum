import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { beforeAll, describe, expect, it } from "vitest";

import { exportPageToSvg } from "./studio-svg-export";

import type { SvgExportEl } from "./studio-svg-export";

const WIDTH = 64;
const HEIGHT = 64;
let resvgModule: typeof import("@resvg/resvg-wasm");

beforeAll(async () => {
  resvgModule = await import("@resvg/resvg-wasm");
  const require = createRequire(import.meta.url);
  await resvgModule.initWasm(
    await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
  );
});

function rect(id: string, fill: string, points: number[]): Extract<SvgExportEl, { type: "draw" }> {
  return {
    id,
    type: "draw",
    kind: "rect",
    points,
    stroke: fill,
    strokeWidth: 0,
    fill,
  };
}

function eraser(
  id: string,
  opacity = 1,
): Extract<SvgExportEl, { type: "draw" }> {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "eraser",
    points: [0, 32, 64, 32],
    stroke: "#5ac8fa",
    strokeWidth: 12,
    opacity,
  };
}

function render(elements: SvgExportEl[], transparentBg = false): Uint8ClampedArray {
  const result = exportPageToSvg({
    width: WIDTH,
    height: HEIGHT,
    bg: "#ffffff",
    transparentBg,
    elements,
  });
  expect(result.skipped).toEqual([]);
  const renderer = new resvgModule.Resvg(result.svg, {
    shapeRendering: 2,
    font: { loadSystemFonts: false },
  });
  const rendered = renderer.render();
  try {
    return new Uint8ClampedArray(rendered.pixels);
  } finally {
    rendered.free();
    renderer.free();
  }
}

function rgba(pixels: Uint8ClampedArray, x: number, y: number): readonly number[] {
  const offset = (y * WIDTH + x) * 4;
  return [...pixels.slice(offset, offset + 4)];
}

describe("SVG causal eraser pixel parity", () => {
  it("keeps the page background, removes earlier ink, and lets later ink repaint", () => {
    const pixels = render([
      rect("ink", "#ff0000", [8, 8, 56, 56]),
      eraser("erase"),
      rect("repaint", "#0000ff", [26, 26, 38, 38]),
    ]);

    expect(rgba(pixels, 16, 16)).toEqual([255, 0, 0, 255]);
    expect(rgba(pixels, 16, 32)).toEqual([255, 255, 255, 255]);
    expect(rgba(pixels, 32, 32)).toEqual([0, 0, 255, 255]);
  });

  it("preserves transparent-background alpha and fractional eraser opacity", () => {
    const fullyErased = render([
      rect("ink", "#ff0000", [8, 8, 56, 56]),
      eraser("erase"),
    ], true);
    expect(rgba(fullyErased, 16, 32)).toEqual([0, 0, 0, 0]);

    const halfErased = render([
      rect("ink", "#ff0000", [8, 8, 56, 56]),
      eraser("erase-half", 0.5),
    ], true);
    const partiallyTransparent = rgba(halfErased, 16, 32);
    // resvg exposes premultiplied RGBA: a half-alpha red pixel therefore carries R ≈ A ≈ 127.
    expect(partiallyTransparent[0]).toBeGreaterThanOrEqual(126);
    expect(partiallyTransparent[0]).toBeLessThanOrEqual(129);
    expect(partiallyTransparent[1]).toBe(0);
    expect(partiallyTransparent[2]).toBe(0);
    expect(partiallyTransparent[3]).toBeGreaterThanOrEqual(126);
    expect(partiallyTransparent[3]).toBeLessThanOrEqual(129);
  });
});
