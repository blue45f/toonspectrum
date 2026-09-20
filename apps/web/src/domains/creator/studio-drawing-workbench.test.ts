import { describe, expect, it } from "vitest";

import { normalizeStudioDrawingPaletteLayout } from "./brush/studio-drawing-palettes";
import { backupStudioDrawingWorkbenchLayout, restoreStudioDrawingWorkbenchLayout } from "./studio-drawing-workbench";
import {
  areStudioWorkspaceLayoutsEqual,
  createStudioWorkspaceDefaultState,
  normalizeStudioWorkspaceState,
  normalizeStudioWorkspaceLayout,
  STUDIO_DEFAULT_WORKSPACES,
} from "./studio-workspaces";

describe("drawing workbench presentation", () => {
  it("starts a new workspace with a real brush dock and a collapsed page navigator", () => {
    const state = createStudioWorkspaceDefaultState(null);
    expect(state.activeWorkspaceId).toBe("lineart");
    expect(state.liveLayout.drawingPalettes.libraryDockOpen).toBe(true);
    expect(state.liveLayout.desktop.leftPanelOpen).toBe(false);
  });

  it("does not reinterpret saved legacy layouts as permission to open a new panel", () => {
    expect(normalizeStudioDrawingPaletteLayout({}).libraryDockOpen).toBe(false);
    expect(normalizeStudioDrawingPaletteLayout({ libraryDockOpen: "true" }).libraryDockOpen).toBe(false);
    const state = createStudioWorkspaceDefaultState(null);
    const restored = normalizeStudioWorkspaceState({ ...state, activeWorkspaceId: "storyboard",
      liveLayout: { ...state.liveLayout, drawingPalettes: {} } });
    expect(restored.activeWorkspaceId).toBe("storyboard");
    expect(restored.liveLayout.drawingPalettes.libraryDockOpen).toBe(false);
  });

  it("treats a dock toggle as a durable layout change and preserves it through JSON", () => {
    const state = createStudioWorkspaceDefaultState(null);
    const closed = normalizeStudioWorkspaceLayout({ ...state.liveLayout,
      drawingPalettes: { ...state.liveLayout.drawingPalettes, libraryDockOpen: false } });
    expect(areStudioWorkspaceLayoutsEqual(state.liveLayout, closed)).toBe(false);
    const reopened = normalizeStudioWorkspaceState(JSON.parse(JSON.stringify(state)));
    expect(reopened.liveLayout.drawingPalettes.libraryDockOpen).toBe(true);
    expect(areStudioWorkspaceLayoutsEqual(state.liveLayout, reopened.liveLayout)).toBe(true);
  });

  it("restores only presentation and retains the original layout as an immutable undo point", () => {
    const previous = STUDIO_DEFAULT_WORKSPACES.find((workspace) => workspace.id === "coloring")!.layout;
    const before = JSON.stringify(previous);
    const next = restoreStudioDrawingWorkbenchLayout(previous);
    expect(next.desktop).toMatchObject({ leftPanelOpen: false, rightPanelOpen: true });
    expect(next.inspector.primary).toBe("layers");
    expect(next.drawingPalettes.libraryDockOpen).toBe(true);
    expect(next.quickActions).toEqual(previous.quickActions);
    expect(next.commandBar).toEqual(previous.commandBar);
    expect(JSON.stringify(previous)).toBe(before);
    expect(Object.isFrozen(next)).toBe(true);
    expect(areStudioWorkspaceLayoutsEqual(previous, normalizeStudioWorkspaceLayout(JSON.parse(before)))).toBe(true);
  });
});

it("stores an independent recoverable layout backup without changing the active workspace", () => {
  const previous = createStudioWorkspaceDefaultState(null);
  const saved = backupStudioDrawingWorkbenchLayout(previous, previous.liveLayout, "드로잉 복원 전 테스트");
  expect(saved.activeWorkspaceId).toBe(previous.activeWorkspaceId);
  expect(saved.customWorkspaces).toHaveLength(1);
  expect(saved.customWorkspaces[0]?.layout).toEqual(previous.liveLayout);
  expect(previous.customWorkspaces).toHaveLength(0);
  expect(normalizeStudioWorkspaceState(JSON.parse(JSON.stringify(saved))).customWorkspaces[0]?.layout).toEqual(previous.liveLayout);
});
