import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  defaultStudioAppSettings,
  formatStudioShortcutChord,
  hideStudioRailTool,
  matchStudioShortcut,
  moveStudioRailTool,
  normalizeStudioAppSettings,
  normalizeStudioRailVisibleIds,
  parseStudioShortcutChord,
  showStudioRailTool,
  studioRailHiddenIds,
  STUDIO_APP_SETTINGS_TABS,
  STUDIO_SHORTCUT_ACTIONS,
} from "./studio-app-settings";

describe("studio-app-settings", () => {
  it("defaults include all Magma-style tabs and full rail order", () => {
    expect(STUDIO_APP_SETTINGS_TABS).toEqual([
      "general",
      "shortcuts",
      "mouse",
      "touch",
      "toolbar",
      "grids",
      "other",
    ]);
    const d = defaultStudioAppSettings();
    expect(d.toolbar.visibleIds).toEqual(DEFAULT_STUDIO_RAIL_TOOL_ORDER);
    expect(Object.keys(d.shortcuts).length).toBe(STUDIO_SHORTCUT_ACTIONS.length);
    expect(d.shortcuts["toggle-chrome"]).toBe("`");
    expect(d.mouse.wheel).toBe("zoom");
    expect(d.touch.oneFingerDrag).toBe("draw");
  });

  it("normalizes broken payloads without throwing", () => {
    const n = normalizeStudioAppSettings({
      general: { densityMode: "nope", showToolHints: "x" },
      toolbar: { visibleIds: ["pen", "pen", "ghost", "eraser"] },
      grids: { pixelGridSize: 47 },
      other: { pressureCurve: 99 },
      shortcuts: { "tool-pen": " P " },
    });
    expect(n.general.densityMode).toBe("full");
    expect(n.general.showToolHints).toBe(true);
    expect(n.toolbar.visibleIds).toEqual(["pen", "eraser"]);
    expect(n.grids.pixelGridSize).toBe(50);
    expect(n.other.pressureCurve).toBe(2.5);
    expect(n.shortcuts["tool-pen"]).toBe("P");
    expect(normalizeStudioAppSettings({ shortcuts: { "toggle-chrome": "Tab" } }).shortcuts["toggle-chrome"]).toBe("`");
  });

  it("rail hide/show/move preserve at least one tool", () => {
    const only = hideStudioRailTool(["pen"], "pen");
    expect(only).toEqual(DEFAULT_STUDIO_RAIL_TOOL_ORDER);
    let list = normalizeStudioRailVisibleIds(["select", "pen", "eraser"]);
    list = moveStudioRailTool(list, "pen", -1);
    expect(list[0]).toBe("pen");
    list = hideStudioRailTool(list, "eraser");
    expect(list).not.toContain("eraser");
    expect(studioRailHiddenIds(list)).toContain("eraser");
    list = showStudioRailTool(list, "eraser");
    expect(list.at(-1)).toBe("eraser");
  });

  it("shortcut chords parse and match events", () => {
    expect(parseStudioShortcutChord("Mod+Shift+Z")).toEqual({
      key: "Z",
      mod: true,
      shift: true,
      alt: false,
    });
    expect(
      matchStudioShortcut("B", { key: "b", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })
    ).toBe(true);
    expect(
      matchStudioShortcut("Mod+D", { key: "d", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })
    ).toBe(true);
    expect(
      matchStudioShortcut("Mod+D", { key: "d", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })
    ).toBe(false);
    expect(formatStudioShortcutChord("Mod+Shift+I")).toContain("⌘");
  });
});
