// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  delete document.documentElement.dataset.creatorExperience;
});

describe("creator experience mode", () => {
  it("defaults to classic and persists Virtual Studio", async () => {
    const { CREATOR_EXPERIENCE_STORAGE_KEY, useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe("classic");
    useCreatorExperienceMode.getState().setMode("virtual-studio");
    expect(document.documentElement.dataset.creatorExperience).toBe("virtual-studio");
    expect(JSON.parse(localStorage.getItem(CREATOR_EXPERIENCE_STORAGE_KEY) ?? "{}")).toEqual({ mode: "virtual-studio" });
  });

  it("restores the saved mode on reload", async () => {
    localStorage.setItem("toonspectrum-creator-experience-mode-v1", JSON.stringify({ mode: "virtual-studio" }));
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    expect(useCreatorExperienceMode.getState().mode).toBe("virtual-studio");
    expect(document.documentElement.dataset.creatorExperience).toBe("virtual-studio");
  });

  it("keeps the session usable when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { useCreatorExperienceMode } = await import("./creator-experience-mode");
    useCreatorExperienceMode.getState().setMode("virtual-studio");
    expect(useCreatorExperienceMode.getState().mode).toBe("virtual-studio");
    expect(useCreatorExperienceMode.getState().storageAvailable).toBe(false);
  });
});
