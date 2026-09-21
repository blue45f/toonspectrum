import { describe, expect, it } from "vitest";
import { defaultStudioAppSettings, DEFAULT_STUDIO_RAIL_TOOL_ORDER, normalizeStudioAppSettings } from "./studio-app-settings";
import { studioDrawingVisibleTools } from "./studio-drawing-core-tools";
import { projectStudioTaskAppSettings } from "./studio-task-tools";
import { moveStudioToolbarTool, pinAllStudioToolbarTools, pinStudioToolbarTools, unpinStudioToolbarTools } from "./studio-toolbar-configuration";

function userToolbar(count: number) {
  return normalizeStudioAppSettings({ toolbar: { visibleIds: [...DEFAULT_STUDIO_RAIL_TOOL_ORDER].reverse().slice(0, count), view: "double" } });
}

describe("explicit toolbar configuration", () => {
  it.each([1, 27, 35])("preserves %i user pins through reload, workspace, and density changes", (count) => {
    const settings = userToolbar(count);
    const restored = normalizeStudioAppSettings(JSON.parse(JSON.stringify(settings)));
    expect(restored.toolbar.visibleIds).toHaveLength(count);
    expect(restored.toolbar.visibleIds).toEqual(settings.toolbar.visibleIds);
    expect(restored.toolbar.configured).toBe(true);
    for (const density of ["simple", "full", "focus"] as const) {
      for (const workspace of ["draw", "comic", "design", "image"] as const) {
        const projected = projectStudioTaskAppSettings(restored, workspace, density);
        expect(projected.toolbar.visibleIds).toEqual(settings.toolbar.visibleIds);
        expect(studioDrawingVisibleTools(projected.toolbar.visibleIds, true)).toHaveLength(count);
      }
    }
  });
  it("appends all missing tools without reordering existing pins", () => {
    const toolbar = userToolbar(27).toolbar;
    const all = pinAllStudioToolbarTools(toolbar);
    expect(all.visibleIds.slice(0, 27)).toEqual(toolbar.visibleIds);
    expect(new Set(all.visibleIds).size).toBe(DEFAULT_STUDIO_RAIL_TOOL_ORDER.length);
    expect(pinAllStudioToolbarTools(all).visibleIds).toEqual(all.visibleIds);
  });
  it("keeps a one-tool configuration and never resurrects recommended tools", () => {
    const toolbar = userToolbar(1).toolbar;
    expect(unpinStudioToolbarTools(toolbar, toolbar.visibleIds).visibleIds).toEqual(toolbar.visibleIds);
    const extra = pinStudioToolbarTools(toolbar, ["pen"]);
    expect(unpinStudioToolbarTools(extra, ["pen"]).visibleIds).toEqual(toolbar.visibleIds);
  });
  it("migrates a stored default array as a user decision, unlike a new workspace", () => {
    const fresh = defaultStudioAppSettings();
    const old = normalizeStudioAppSettings({ toolbar: { visibleIds: fresh.toolbar.visibleIds } });
    expect(fresh.toolbar.configured).toBe(false);
    expect(old.toolbar.configured).toBe(true);
    expect(projectStudioTaskAppSettings(old, "draw", "focus").toolbar.visibleIds).toEqual(fresh.toolbar.visibleIds);
  });
  it("preserves unknown ids without executing them and validates named profiles", () => {
    const settings = normalizeStudioAppSettings({ toolbar: { visibleIds: ["pen", "future-ink", "pen"], profiles: [
      { id: "mine", name: "선화", visibleIds: ["pen", "eraser"], view: "list" },
      { id: "mine", name: "중복", visibleIds: ["select"] },
    ] } });
    expect(settings.toolbar.visibleIds).toEqual(["pen"]);
    expect(settings.toolbar.archivedIds).toEqual(["future-ink"]);
    expect(settings.toolbar.profiles).toHaveLength(1);
    expect(normalizeStudioAppSettings(settings).toolbar).toEqual(settings.toolbar);
  });
  it("supports first/last/index movement without losing a tool or view setting", () => {
    const toolbar = userToolbar(27).toolbar;
    const moved = moveStudioToolbarTool(toolbar, toolbar.visibleIds[26]!, 0);
    expect(moved.visibleIds[0]).toBe(toolbar.visibleIds[26]);
    expect(moved.view).toBe("double");
    expect(new Set(moved.visibleIds)).toEqual(new Set(toolbar.visibleIds));
  });
});
