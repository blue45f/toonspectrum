import { describe, expect, it } from "vitest";

import {
  resolveStudioWorkspaceCanvasDockInsets,
  type StudioWorkspaceCanvasDockInsetsInput,
} from "./studio-workspace-canvas-dock";

describe("studio workspace canvas dock insets", () => {
  const baseInput: StudioWorkspaceCanvasDockInsetsInput = {
    leftPanelWidth: 160,
    rightPanelWidth: 280,
    visibleLeftPanelOpen: false,
    visibleRightPanelOpen: false,
    uiDensityMode: "full",
  };

  it("keeps tool-rail inset when left dock is visible and open", () => {
    const insets = resolveStudioWorkspaceCanvasDockInsets({
      ...baseInput,
      visibleLeftPanelOpen: true,
      visibleRightPanelOpen: true,
    });

    expect(insets).toEqual({ left: 220, right: 288 });
  });

  it("maximizes dock width when left dock is hidden", () => {
    expect(
      resolveStudioWorkspaceCanvasDockInsets({
        ...baseInput,
        visibleLeftPanelOpen: false,
        visibleRightPanelOpen: false,
      })
    ).toEqual({ left: 52, right: 0 });
  });

  it("applies right-side dock width only when the right dock is visible", () => {
    expect(
      resolveStudioWorkspaceCanvasDockInsets({
        ...baseInput,
        visibleLeftPanelOpen: false,
        visibleRightPanelOpen: true,
      })
    ).toEqual({ left: 52, right: 288 });
  });

  it("keeps current tool-rail reserve when panels are hidden under simple mode", () => {
    expect(
      resolveStudioWorkspaceCanvasDockInsets({
        ...baseInput,
        uiDensityMode: "simple",
        visibleLeftPanelOpen: false,
        visibleRightPanelOpen: false,
      })
    ).toEqual({ left: 52, right: 0 });
  });

  it("keeps tool rail inset in focus mode even when panels are hidden", () => {
    expect(
      resolveStudioWorkspaceCanvasDockInsets({
        ...baseInput,
        uiDensityMode: "focus",
        visibleLeftPanelOpen: false,
        visibleRightPanelOpen: false,
      })
    ).toEqual({ left: 52, right: 0 });
  });
});
