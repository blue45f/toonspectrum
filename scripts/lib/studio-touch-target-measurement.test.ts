import { describe, expect, it } from "vitest";

import { meetsStudioMinimumTouchTarget } from "./studio-touch-target-measurement.mjs";

describe("Studio touch target measurement", () => {
  it("accepts the observed composited float error on an actual 44px CSS control", () => {
    expect(meetsStudioMinimumTouchTarget({ width: 50.203125, height: 43.999996185302734 })).toBe(true);
    expect(meetsStudioMinimumTouchTarget({ width: 44, height: 44 })).toBe(true);
  });
  it("still rejects undersized controls and invalid measurements", () => {
    for (const size of [43.999, 43.9, 40, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(meetsStudioMinimumTouchTarget({ width: size, height: 44 })).toBe(false);
      expect(meetsStudioMinimumTouchTarget({ width: 44, height: size })).toBe(false);
    }
  });
});
