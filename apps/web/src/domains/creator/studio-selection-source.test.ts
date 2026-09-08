import { describe, expect, it } from "vitest";

import {
  alphaMaskFromRgba,
  applySelectionSourceMask,
  foregroundConfidenceToMask,
  multiplySelectionSourceMasks,
  selectionSourceMaskHasContent,
} from "./studio-selection-source";
import {
  pointInSelection,
  setSelectionFeather,
} from "./studio-selection-tools";

import type { ColorRangeMask } from "./studio-color-range";

function blockMask(
  width: number,
  height: number,
  blocks: readonly { x0: number; y0: number; x1: number; y1: number }[],
): ColorRangeMask {
  const alpha = new Uint8ClampedArray(width * height);
  for (const block of blocks) {
    for (let y = block.y0; y < block.y1; y += 1) {
      for (let x = block.x0; x < block.x1; x += 1) {
        alpha[y * width + x] = 255;
      }
    }
  }
  return { width, height, alpha };
}

const left = blockMask(16, 16, [{ x0: 1, y0: 2, x1: 7, y1: 14 }]);
const right = blockMask(16, 16, [{ x0: 9, y0: 2, x1: 15, y1: 14 }]);

describe("studio-selection-source", () => {
  it("extracts source alpha exactly and rejects mismatched buffers", () => {
    const rgba = new Uint8ClampedArray([
      10, 20, 30, 0,
      40, 50, 60, 127,
      70, 80, 90, 255,
      1, 2, 3, 64,
    ]);
    expect([...alphaMaskFromRgba(rgba, 2, 2).alpha]).toEqual([0, 127, 255, 64]);
    expect(() => alphaMaskFromRgba(rgba, 3, 2)).toThrow(/RGBA/u);
  });

  it("turns confidence into a soft antialiased matte around the threshold", () => {
    const mask = foregroundConfidenceToMask(
      new Float32Array([0, 0.41, 0.5, 0.59, 1, Number.NaN]),
      3,
      2,
      { threshold: 0.5, softness: 0.2 },
    );

    expect(mask.alpha[0]).toBe(0);
    expect(mask.alpha[1]).toBeGreaterThan(0);
    expect(mask.alpha[1]).toBeLessThan(128);
    expect(mask.alpha[2]).toBeGreaterThanOrEqual(120);
    expect(mask.alpha[2]).toBeLessThanOrEqual(136);
    expect(mask.alpha[3]).toBeGreaterThan(128);
    expect(mask.alpha[4]).toBe(255);
    expect(mask.alpha[5]).toBe(0);
  });

  it("multiplies semantic confidence by source transparency", () => {
    const semantic = { width: 2, height: 1, alpha: new Uint8ClampedArray([255, 128]) };
    const source = { width: 2, height: 1, alpha: new Uint8ClampedArray([64, 128]) };
    const combined = multiplySelectionSourceMasks(semantic, source);

    expect([...combined.alpha]).toEqual([64, 64]);
    expect(selectionSourceMaskHasContent(combined, 64)).toBe(true);
    expect(selectionSourceMaskHasContent(combined, 65)).toBe(false);
  });

  it("shares replace/add/subtract/intersect semantics with the other pixel-selection tools", () => {
    const first = applySelectionSourceMask(null, left, "replace")!;
    expect(pointInSelection(first, { x: 0.25, y: 0.5 })).toBe(true);
    expect(pointInSelection(first, { x: 0.75, y: 0.5 })).toBe(false);

    const added = applySelectionSourceMask(first, right, "add")!;
    expect(pointInSelection(added, { x: 0.25, y: 0.5 })).toBe(true);
    expect(pointInSelection(added, { x: 0.75, y: 0.5 })).toBe(true);

    const subtracted = applySelectionSourceMask(added, left, "subtract")!;
    expect(pointInSelection(subtracted, { x: 0.25, y: 0.5 })).toBe(false);
    expect(pointInSelection(subtracted, { x: 0.75, y: 0.5 })).toBe(true);

    const topRight = blockMask(16, 16, [{ x0: 8, y0: 1, x1: 16, y1: 8 }]);
    const intersected = applySelectionSourceMask(added, topRight, "intersect")!;
    expect(pointInSelection(intersected, { x: 0.75, y: 0.25 })).toBe(true);
    expect(pointInSelection(intersected, { x: 0.75, y: 0.75 })).toBe(false);
    expect(pointInSelection(intersected, { x: 0.25, y: 0.25 })).toBe(false);
  });

  it("preserves feather preference on replace and mirrors generated masks into display space", () => {
    const initial = setSelectionFeather(
      applySelectionSourceMask(null, left, "replace")!,
      12,
    );
    const replaced = applySelectionSourceMask(initial, right, "replace", { flipX: true })!;

    expect(replaced.featherPx).toBe(12);
    expect(pointInSelection(replaced, { x: 0.25, y: 0.5 })).toBe(true);
    expect(pointInSelection(replaced, { x: 0.75, y: 0.5 })).toBe(false);
  });
});
