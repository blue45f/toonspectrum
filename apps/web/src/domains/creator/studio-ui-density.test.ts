import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_UI_DENSITY_MODE,
  loadStudioUiDensityState,
  normalizeStudioUiDensityMode,
  saveStudioUiDensityState,
  STUDIO_UI_DENSITY_MODES,
  studioUiDensityAllows,
  studioUiDensityFromImmersive,
  studioUiDensityLabel,
} from "./studio-ui-density";

describe("studio ui density modes", () => {
  it("starts new users in standard work and uses task-oriented labels", () => {
    expect(DEFAULT_STUDIO_UI_DENSITY_MODE).toBe("simple");
    expect(STUDIO_UI_DENSITY_MODES).toEqual(["focus", "simple", "full"]);
    expect(normalizeStudioUiDensityMode("nope")).toBe("simple");
    expect(normalizeStudioUiDensityMode("simple")).toBe("simple");
    expect(studioUiDensityFromImmersive(true)).toBe("focus");
    expect(studioUiDensityLabel("focus")).toBe("집중 작업");
    expect(studioUiDensityLabel("simple")).toBe("표준 작업");
    expect(studioUiDensityLabel("full")).toBe("전체 기능");
  });

  it("folds AI in standard work but honors reference tools users explicitly expose", () => {
    expect(studioUiDensityAllows("simple", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-ai")).toBe(false);
    expect(studioUiDensityAllows("simple", "toolbar-reference")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-assets")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-insert")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("focus", "tool-rail")).toBe(true);
    expect(studioUiDensityAllows("focus", "quick-actions")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-assets")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-insert")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-cut")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-ai")).toBe(false);
    expect(studioUiDensityAllows("focus", "toolbar-reference")).toBe(false);
    expect(studioUiDensityAllows("focus", "right-panel")).toBe(false);
    expect(studioUiDensityAllows("full", "toolbar-ai")).toBe(true);
  });

  it("persists an existing user's density choice", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(saveStudioUiDensityState(storage, { mode: "full" })).toBe(true);
    expect(loadStudioUiDensityState(storage).mode).toBe("full");
  });
});
