import { describe, expect, it, vi } from "vitest";

import { buildStudioSelectionBorderMask, studioSelectionBorderFromMask, studioSelectionBorderRasterSize } from "./studio-selection-border";
import { executeStudioSelectionBorderWorkerRequest } from "./studio-selection-border-worker-runtime";
import { createPixelSelectionHistory, commitPixelSelectionHistory, undoPixelSelectionHistory, redoPixelSelectionHistory } from "./studio-pixel-selection-history";
import { emptyPixelSelection, pointInSelection, rectSelectionPolygon, selectAllPixels } from "./studio-selection-tools";

import type { ColorRangeMask } from "./studio-color-range";
import type { StudioSelectionBorderOptions } from "./studio-selection-border";
import type { PixelSelection } from "./studio-selection-tools";

const rectangle: PixelSelection = {
  ...emptyPixelSelection(), featherPx: 7,
  subpaths: [{ mode: "add", points: rectSelectionPolygon({ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }) }],
};
function raster(selection: PixelSelection, width = 32, height = width): ColorRangeMask {
  return { width, height, alpha: Uint8ClampedArray.from({ length: width * height }, (_, index) =>
    pointInSelection(selection, { x: ((index % width) + 0.5) / width, y: (Math.floor(index / width) + 0.5) / height }, { aspect: height / width }) ? 255 : 0) };
}
const options: StudioSelectionBorderOptions = { widthPx: 2, placement: "inside", displayWidth: 32, displayHeight: 32 };
const at = (mask: ColorRangeMask, x: number, y: number) => mask.alpha[y * mask.width + x];

/** Slow, independent reference: distance to every opposite pixel, including transparent frame. */
function bruteBorder(mask: ColorRangeMask, opts: StudioSelectionBorderOptions) {
  const output = new Uint8ClampedArray(mask.alpha.length);
  for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
    const inside = at(mask, x, y)! >= 128;
    if (inside ? opts.placement === "outside" : opts.placement === "inside") continue;
    const limit = opts.widthPx / (opts.placement === "center" ? 2 : 1);
    for (let sy = -1; sy <= mask.height; sy += 1) for (let sx = -1; sx <= mask.width; sx += 1) {
      const targetInside = sx >= 0 && sy >= 0 && sx < mask.width && sy < mask.height && at(mask, sx, sy)! >= 128;
      if (targetInside === inside) continue;
      const distance = ((sx - x) * opts.displayWidth / mask.width) ** 2 + ((sy - y) * opts.displayHeight / mask.height) ** 2;
      if (distance <= limit ** 2) output[y * mask.width + x] = 255;
    }
  }
  return output;
}

describe("selection border", () => {
  it("selects only the requested side and rounds outside corners by Euclidean distance", () => {
    const mask = raster(rectangle);
    const inside = buildStudioSelectionBorderMask(mask, options);
    const outside = buildStudioSelectionBorderMask(mask, { ...options, placement: "outside" });
    const centered = buildStudioSelectionBorderMask(mask, { ...options, widthPx: 4, placement: "center" });
    expect(at(inside, 8, 16)).toBe(255);
    expect(at(inside, 9, 16)).toBe(255);
    expect(at(inside, 10, 16)).toBe(0);
    expect(at(inside, 7, 16)).toBe(0);
    expect(at(outside, 6, 16)).toBe(255);
    expect(at(outside, 8, 16)).toBe(0);
    expect(at(outside, 6, 6)).toBe(0);
    expect(at(outside, 7, 7)).toBe(255);
    expect(centered.alpha).toEqual(Uint8ClampedArray.from(inside.alpha, (value, index) => Math.max(value, outside.alpha[index]!)));
  });

  it("matches an independent brute-force reference for mixed alpha, holes, islands and non-square pixels", () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const mask = { width: 9, height: 7, alpha: Uint8ClampedArray.from({ length: 63 }, (_, index) => ((index * 37 + seed * 19) % 7) * 42) };
      for (const placement of ["inside", "center", "outside"] as const) for (const widthPx of [1, 2, 4]) {
        const opts = { widthPx, placement, displayWidth: 13.5, displayHeight: 7 };
        expect(buildStudioSelectionBorderMask(mask, opts).alpha).toEqual(bruteBorder(mask, opts));
      }
    }
  });

  it("keeps the center of holes empty and outlines each disconnected component", () => {
    const donut = { ...rectangle, subpaths: [...rectangle.subpaths,
      { mode: "subtract" as const, points: rectSelectionPolygon({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }) },
      { mode: "add" as const, points: rectSelectionPolygon({ x: 0.02, y: 0.02 }, { x: 0.15, y: 0.15 }) },
    ] };
    const mask = raster(donut, 64);
    const next = studioSelectionBorderFromMask(mask, donut, { ...options, displayWidth: 64, displayHeight: 64 });
    expect(next?.featherPx).toBe(7);
    expect(pointInSelection(next, { x: 0.5, y: 0.5 })).toBe(false);
    expect(pointInSelection(next, { x: 0.5, y: 0.385 })).toBe(true);
    expect(pointInSelection(next, { x: 0.03, y: 0.07 })).toBe(true);
    expect(pointInSelection(next, { x: 0.32, y: 0.32 })).toBe(false);
  });

  it("handles full-image, inverted and empty selections at the image boundary", () => {
    const full = selectAllPixels(rectangle);
    const inside = studioSelectionBorderFromMask(raster(full), full, options);
    expect(pointInSelection(inside, { x: 0.02, y: 0.5 })).toBe(true);
    expect(pointInSelection(inside, { x: 0.5, y: 0.5 })).toBe(false);
    expect(studioSelectionBorderFromMask(raster(full), full, { ...options, placement: "outside" })).toBeNull();
    expect(studioSelectionBorderFromMask(raster(emptyPixelSelection()), rectangle, options)).toBeNull();
    const inverted = { ...rectangle, invert: true };
    const invertedBorder = studioSelectionBorderFromMask(raster(inverted), inverted, options);
    expect(pointInSelection(invertedBorder, { x: 0.21, y: 0.5 })).toBe(true);
    expect(pointInSelection(invertedBorder, { x: 0.5, y: 0.5 })).toBe(false);
  });

  it("preserves a uniform displayed thickness for a wide image", () => {
    const mask = raster(rectangle, 32, 16);
    const border = buildStudioSelectionBorderMask(mask, { ...options, displayWidth: 64, displayHeight: 16 });
    expect(at(border, 8, 8)).toBe(255);
    expect(at(border, 9, 8)).toBe(0);
    expect(at(border, 16, 4)).toBe(255);
    expect(at(border, 16, 5)).toBe(255);
    expect(at(border, 16, 6)).toBe(0);
  });

  it("validates finite sizes, bounded allocation and useful preview precision without mutating inputs", () => {
    expect(studioSelectionBorderRasterSize(2560, 1280)).toEqual({ width: 640, height: 320, minimumWidthPx: 8 });
    expect(() => studioSelectionBorderRasterSize(NaN, 32)).toThrow(RangeError);
    const mask = raster(rectangle);
    const before = mask.alpha.slice();
    buildStudioSelectionBorderMask(mask, options);
    expect(mask.alpha).toEqual(before);
    for (const widthPx of [0, -1, NaN, Infinity, 129]) expect(() => buildStudioSelectionBorderMask(mask, { ...options, widthPx })).toThrow(RangeError);
    expect(() => buildStudioSelectionBorderMask({ ...mask, width: 641 }, options)).toThrow(RangeError);
    expect(() => buildStudioSelectionBorderMask({ ...mask, alpha: new Uint8ClampedArray(1) }, options)).toThrow(RangeError);
  });

  it("rejects excessive islands or tiny holes instead of silently truncating the selection", () => {
    const mask = { width: 100, height: 100, alpha: new Uint8ClampedArray(10000) };
    for (let index = 0; index < 49; index += 1) mask.alpha[(Math.floor(index / 7) * 12 + 2) * 100 + (index % 7) * 12 + 2] = 255;
    expect(() => studioSelectionBorderFromMask(mask, rectangle, { ...options, displayWidth: 100, displayHeight: 100 })).toThrow("너무 많은 영역");
    const full = { width: 640, height: 640, alpha: new Uint8ClampedArray(640 * 640).fill(255) };
    full.alpha[320 * 640 + 320] = 0;
    expect(() => studioSelectionBorderFromMask(full, rectangle, { ...options, displayWidth: 640, displayHeight: 640 })).toThrow("작은 구멍");
  });

  it("processes the maximum 640px mask without width-dependent allocations or losing its hole", () => {
    const mask = raster(rectangle, 640);
    const next = studioSelectionBorderFromMask(mask, rectangle, { ...options, widthPx: 128, placement: "center", displayWidth: 640, displayHeight: 640 });
    expect(next?.subpaths.length).toBe(2);
    expect(pointInSelection(next, { x: 0.2, y: 0.5 })).toBe(true);
    expect(pointInSelection(next, { x: 0.5, y: 0.5 })).toBe(false);
  });

  it("rejects malformed raw worker requests before allocating or reading any canvas", () => {
    const readMask = vi.fn(() => raster(rectangle));
    for (const dimensions of [{ width: 641, height: 1 }, { width: NaN, height: 32 }, { width: 32, height: 0 }]) {
      expect(() => executeStudioSelectionBorderWorkerRequest({ kind: "selection-border", ...options, ...dimensions, selection: rectangle }, readMask)).toThrow(RangeError);
    }
    expect(readMask).not.toHaveBeenCalled();
  });

  it("returns the worker result through canonical selection undo and redo without changing source pixels", () => {
    const next = executeStudioSelectionBorderWorkerRequest({ kind: "selection-border", ...options, width: 32, height: 32, selection: rectangle }, () => raster(rectangle));
    const history = createPixelSelectionHistory("image", rectangle);
    const committed = commitPixelSelectionHistory(history, "image", next, { operation: "transform" });
    const undone = undoPixelSelectionHistory(committed.history, "image");
    const redone = redoPixelSelectionHistory(undone.history, "image");
    expect(undone.selection).toEqual(rectangle);
    expect(redone.selection).toEqual(next);
    expect(redone.selection?.featherPx).toBe(7);
  });
});
