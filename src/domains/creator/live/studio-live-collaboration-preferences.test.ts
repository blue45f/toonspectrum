import { describe, expect, it } from "vitest";

import {
  resolveStudioLiveCursorIntervalMs,
  resolveStudioLiveCursorLimit,
} from "./studio-live-collaboration-preferences";

describe("studio live collaboration quality", () => {
  it("uses a smooth 60Hz ceiling when explicitly requested", () => {
    expect(resolveStudioLiveCursorIntervalMs("smooth", { saveData: true })).toBe(16);
    expect(resolveStudioLiveCursorLimit("smooth", { saveData: true })).toBe(64);
  });

  it("adapts automatic quality to constrained connections", () => {
    expect(
      resolveStudioLiveCursorIntervalMs("auto", {
        saveData: true,
        effectiveType: "4g",
      })
    ).toBe(96);
    expect(
      resolveStudioLiveCursorLimit("auto", {
        saveData: true,
        effectiveType: "4g",
      })
    ).toBe(12);
    expect(resolveStudioLiveCursorIntervalMs("auto", { effectiveType: "3g" })).toBe(64);
    expect(resolveStudioLiveCursorLimit("auto", { effectiveType: "3g" })).toBe(24);
  });

  it("keeps automatic desktop collaboration responsive", () => {
    expect(
      resolveStudioLiveCursorIntervalMs("auto", {
        effectiveType: "4g",
        reducedMotion: false,
      })
    ).toBe(32);
    expect(
      resolveStudioLiveCursorLimit("auto", {
        effectiveType: "4g",
        reducedMotion: false,
      })
    ).toBe(48);
  });
});
