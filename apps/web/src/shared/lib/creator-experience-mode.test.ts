// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  delete document.documentElement.dataset.creatorExperience;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("studio view preference", () => {
  it("defaults to space on desktop and persists a selected list view", async () => {
    const { CREATOR_EXPERIENCE_STORAGE_KEY, useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe("virtual-studio");
    useCreatorExperienceMode.getState().setMode("classic");
    expect(document.documentElement.dataset.creatorExperience).toBe("classic");
    expect(JSON.parse(localStorage.getItem(CREATOR_EXPERIENCE_STORAGE_KEY) ?? "{}")).toEqual({ mode: "classic" });
  });
  it("defaults to list view on a narrow device", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe("classic");
  });
  it.each(["classic", "virtual-studio"])("preserves the explicit legacy preference %s", async (mode) => {
    localStorage.setItem("toonspectrum-creator-experience-mode-v1", JSON.stringify({ mode }));
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe(mode);
  });
  it("keeps view switching usable when storage writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    useCreatorExperienceMode.getState().setMode("classic");
    expect(useCreatorExperienceMode.getState().mode).toBe("classic");
    expect(useCreatorExperienceMode.getState().storageAvailable).toBe(false);
  });
  it("recovers from a corrupt saved value without preventing home rendering", async () => {
    localStorage.setItem("toonspectrum-creator-experience-mode-v1", "{broken");
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe("virtual-studio");
  });
});
