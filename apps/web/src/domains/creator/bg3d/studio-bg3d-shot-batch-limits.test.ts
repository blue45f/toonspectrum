import { describe, expect, it } from "vitest";
import { isStudioBg3dShotBatchIntegerInRange, isStudioBg3dShotBatchNumberInRange } from "./studio-bg3d-shot-batch-limits";


describe("shared shot-batch bounded integer validation", () => {
  it("preserves the previous acceptance and rejection predicates", () => {
    const values: unknown[] = [undefined, null, false, true, "1", "256", {}, [],
      Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY,
      Number.MIN_SAFE_INTEGER - 1, Number.MIN_SAFE_INTEGER, -4096, -1, -0, 0,
      0.5, 1, 255, 255.5, 256, 4095, 4096, 4097, 8192, 8193,
      Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, BigInt(1), Symbol("number")];
    const ranges = [[1, 4096], [256, 4096], [1, 8192],
      [1, Number.MAX_SAFE_INTEGER], [-4096, 0], [0, 0]] as const;
    for (const [minimum, maximum] of ranges) {
      for (const value of values) {
        const accepted = Number.isSafeInteger(value) &&
          (value as number) >= minimum && (value as number) <= maximum;
        const rejected = !Number.isSafeInteger(value) ||
          (value as number) < minimum || (value as number) > maximum;
        const result = isStudioBg3dShotBatchIntegerInRange(value, minimum, maximum);
        expect(result).toBe(accepted);
        expect(result).toBe(!rejected);
      }
    }
  });
  it("does not invoke caller-controlled conversion hooks", () => {
    const value = { valueOf() { throw new Error("must not coerce"); } };
    expect(isStudioBg3dShotBatchIntegerInRange(value, 1, 4096)).toBe(false);
  });
  it("fails closed for invalid or reversed bounds", () => {
    expect(isStudioBg3dShotBatchIntegerInRange(1, Number.NaN, 4096)).toBe(false);
    expect(isStudioBg3dShotBatchIntegerInRange(1, 0, Number.NaN)).toBe(false);
    expect(isStudioBg3dShotBatchIntegerInRange(1, 4096, 0)).toBe(false);
  });
});
it("preserves finite fractional capture settings without coercing invalid inputs", () => {
  const values: unknown[] = [undefined, null, "0.5", {}, [], false, 0, 0.001, 0.01,
    0.5, 1, 3.999, 4, 4.001, 8, 8.001, Number.NaN, Infinity, -Infinity];
  for (const [minimum, maximum] of [[0.01, 4], [0, 8]] as const) {
    for (const value of values) {
      const previous = typeof value === "number" && Number.isFinite(value) &&
        value >= minimum && value <= maximum;
      expect(isStudioBg3dShotBatchNumberInRange(value, minimum, maximum)).toBe(previous);
    }
  }
});
