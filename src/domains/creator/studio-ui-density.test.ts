import { describe, expect, it } from "vitest";

import {
  loadStudioUiDensityState,
  normalizeStudioUiDensityMode,
  saveStudioUiDensityState,
  studioUiDensityAllows,
  studioUiDensityFromImmersive,
  studioUiDensityLabel,
} from "./studio-ui-density";

describe("studio ui density modes", () => {
  it("normalizes unknown modes to full and maps Magma layout labels", () => {
    expect(normalizeStudioUiDensityMode("nope")).toBe("full");
    expect(normalizeStudioUiDensityMode("simple")).toBe("simple");
    expect(studioUiDensityFromImmersive(true)).toBe("focus");
    // Magma Super Simple / Simple / Full (IA only)
    expect(studioUiDensityLabel("focus")).toBe("슈퍼심플");
    expect(studioUiDensityLabel("simple")).toBe("심플");
    expect(studioUiDensityLabel("full")).toBe("전체");
  });

  it("hides AI/reference in simple and most chrome in focus (Super Simple)", () => {
    expect(studioUiDensityAllows("simple", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-ai")).toBe(false);
    expect(studioUiDensityAllows("simple", "toolbar-reference")).toBe(false);
    expect(studioUiDensityAllows("focus", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("focus", "tool-rail")).toBe(true);
    expect(studioUiDensityAllows("focus", "quick-actions")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-assets")).toBe(false);
    expect(studioUiDensityAllows("focus", "right-panel")).toBe(false);
    expect(studioUiDensityAllows("full", "toolbar-ai")).toBe(true);
  });

  it("persists density mode through storage helpers", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(saveStudioUiDensityState(storage, { mode: "simple" })).toBe(true);
    expect(loadStudioUiDensityState(storage).mode).toBe("simple");
  });
});
