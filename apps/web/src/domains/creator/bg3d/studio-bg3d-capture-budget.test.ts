import { describe, expect, it } from "vitest";
import { assertStudioBg3dCaptureBudget } from "./studio-bg3d-capture-budget";

describe("Scene3D color and depth capture budgets", () => {
  it("admits a 4096-square color output without enlarging the LT/depth budget", () => {
    expect(() => assertStudioBg3dCaptureBudget({ width: 4096, height: 4096, includeDepth: false })).not.toThrow();
    expect(() => assertStudioBg3dCaptureBudget({ width: 4096, height: 4096, includeDepth: true })).toThrow(/budget/);
    expect(() => assertStudioBg3dCaptureBudget({ width: 3840, height: 2160, includeDepth: true })).not.toThrow();
  });
  it("refuses unsafe counts, excessive edges and excessive pixel products before allocation", () => {
    for (const width of [0, -1, NaN, Infinity, 1.5, 8193, Number.MAX_SAFE_INTEGER]) {
      expect(() => assertStudioBg3dCaptureBudget({ width, height: 1, includeDepth: false })).toThrow(RangeError);
    }
    expect(() => assertStudioBg3dCaptureBudget({ width: 4096, height: 4097, includeDepth: false })).toThrow(RangeError);
  });
});


it("accounts for all optional normal targets/readbacks before allocating an export", () => {
  expect(() => assertStudioBg3dCaptureBudget({ width: 2048, height: 2048, includeDepth: true, includeNormals: true })).not.toThrow();
  expect(() => assertStudioBg3dCaptureBudget({ width: 4096, height: 2048, includeDepth: true, includeNormals: true })).toThrow(/budget/);
  expect(() => assertStudioBg3dCaptureBudget({ width: 4096, height: 2048, includeDepth: true })).not.toThrow();
  expect(() => assertStudioBg3dCaptureBudget({ width: 2, height: 2, includeDepth: false, includeNormals: true })).toThrow();
});
