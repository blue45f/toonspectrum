import { describe, expect, it } from "vitest";

import {
  assertStudio3dInlineInputBudget,
  formatStudio3dInlineBudget,
  STUDIO_3D_INLINE_RAW_INPUT_MAX_BYTES,
  studio3dInlineInputBytes,
} from "./studio-3d-inline-budget";

describe("studio 3D inline input budget", () => {
  it("counts all image and model inputs together", () => {
    expect(studio3dInlineInputBytes([
      { size: 2 * 1024 * 1024 },
      { size: 3 * 1024 * 1024 },
    ])).toBe(5 * 1024 * 1024);
  });

  it("accepts the bounded raw payload ceiling", () => {
    expect(assertStudio3dInlineInputBudget([
      { size: STUDIO_3D_INLINE_RAW_INPUT_MAX_BYTES },
    ])).toBe(STUDIO_3D_INLINE_RAW_INPUT_MAX_BYTES);
  });

  it("rejects an aggregate payload that would exceed the 16MB JSON parser after base64", () => {
    expect(() => assertStudio3dInlineInputBudget([
      { size: 6 * 1024 * 1024 },
      { size: 5 * 1024 * 1024 },
    ])).toThrow(/10MB/u);
  });

  it("formats the budget for the preflight UI", () => {
    expect(formatStudio3dInlineBudget(0)).toBe("0 MB");
    expect(formatStudio3dInlineBudget(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
