import { describe, expect, it } from "vitest";

import { finitePositiveGroupResizeBounds } from "./studio-group-resize-bounds";

import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";

const valid: StudioGroupUniformResizeBounds = Object.freeze({
  x: -10, y: 0, width: 20, height: 30,
});

describe("finite positive group resize bounds", () => {
  it("accepts negative and zero origins without changing frozen input", () => {
    expect(finitePositiveGroupResizeBounds(valid)).toBe(true);
    expect(valid).toEqual({ x: -10, y: 0, width: 20, height: 30 });
  });

  it("accepts finite fractional sizes", () => {
    expect(finitePositiveGroupResizeBounds({
      x: -0.5, y: 0.5, width: 0.25, height: 0.125,
    })).toBe(true);
  });

  for (const field of ["x", "y", "width", "height"] as const) {
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      `rejects non-finite ${field}: %s`, (value) => {
        expect(finitePositiveGroupResizeBounds({ ...valid, [field]: value })).toBe(false);
      },
    );
  }

  for (const field of ["width", "height"] as const) {
    it.each([0, -0, -1, -Number.MIN_VALUE])(
      `rejects non-positive ${field}: %s`, (value) => {
        expect(finitePositiveGroupResizeBounds({ ...valid, [field]: value })).toBe(false);
      },
    );
  }

  it("preserves the existing strictly-positive size boundary", () => {
    expect(finitePositiveGroupResizeBounds({
      ...valid, width: Number.MIN_VALUE, height: Number.MIN_VALUE,
    })).toBe(true);
  });
});
