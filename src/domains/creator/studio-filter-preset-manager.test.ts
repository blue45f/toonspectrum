import { describe, it, expect } from "vitest";
import { StudioFilterPresetManager } from "./studio-filter-preset-manager";

describe("StudioFilterPresetManager", () => {
  it("initializes with default builtin presets", () => {
    const manager = new StudioFilterPresetManager();
    const all = manager.getAllPresets();
    expect(all.length).toBeGreaterThan(0);
    expect(manager.getPreset("preset-romance-pink")).toBeDefined();
  });

  it("registers and retrieves custom preset", () => {
    const manager = new StudioFilterPresetManager();
    manager.registerPreset({
      id: "custom-1",
      name: "테스트 툰 필터",
      category: "custom",
      createdAt: "2026-08-02",
      draft: { kind: "photo-filter", values: { brightness: 5 } },
    });

    expect(manager.getPreset("custom-1")?.name).toBe("테스트 툰 필터");
    expect(manager.getPresetsByCategory("custom").length).toBe(1);
  });

  it("toggles favorite state", () => {
    const manager = new StudioFilterPresetManager();
    expect(manager.getFavorites().length).toBe(0);

    manager.toggleFavorite("preset-romance-pink");
    expect(manager.getFavorites().length).toBe(1);
    expect(manager.getFavorites()[0].id).toBe("preset-romance-pink");
  });

  it("exports and imports presets to/from JSON", () => {
    const manager = new StudioFilterPresetManager();
    const json = manager.exportPresetsToJSON(["preset-romance-pink", "preset-action-neon"]);

    const manager2 = new StudioFilterPresetManager();
    const result = manager2.importPresetsFromJSON(json);

    expect(result.importedCount).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(manager2.getPreset("preset-romance-pink")).toBeDefined();
  });

  it("handles malformed JSON import gracefully", () => {
    const manager = new StudioFilterPresetManager();
    const result = manager.importPresetsFromJSON("{ invalid json }");
    expect(result.importedCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
