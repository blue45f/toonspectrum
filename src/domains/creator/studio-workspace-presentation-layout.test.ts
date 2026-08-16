import { describe, expect, it } from "vitest";

import { resolveStudioWorkspacePanelLayoutVisibility } from "./studio-workspace-presentation-layout";

describe("studio workspace panel layout visibility", () => {
  it("hides both docks in canvas-only mode", () => {
    const layout = resolveStudioWorkspacePanelLayoutVisibility({
      isMobile: false,
      isFullscreen: false,
      maximized: false,
      mobileImmersive: false,
      canvasOnlyMode: true,
      uiDensityMode: "full",
      activeWorkspaceId: "lineart",
      leftPanelOpen: true,
      rightPanelOpen: true,
      forceRightPanelOpen: false,
    });
    expect(layout.presentationPanelsHidden).toBe(true);
    expect(layout.visibleLeftPanelOpen).toBe(false);
    expect(layout.visibleRightPanelOpen).toBe(false);
  });

  it("keeps focus-mode right panel available when forced", () => {
    const layout = resolveStudioWorkspacePanelLayoutVisibility({
      isMobile: false,
      isFullscreen: false,
      maximized: false,
      mobileImmersive: false,
      canvasOnlyMode: false,
      uiDensityMode: "full",
      activeWorkspaceId: "lineart",
      leftPanelOpen: true,
      rightPanelOpen: true,
      forceRightPanelOpen: true,
    });
    expect(layout.canvasWideWorkspaceDensityMode).toBe("focus");
    expect(layout.densityHidesLeftPanel).toBe(true);
    expect(layout.rightPanelDensityAllows).toBe(true);
    expect(layout.visibleRightPanelOpen).toBe(true);
  });

  it("keeps mobile density and right panel hidden by UI density", () => {
    const layout = resolveStudioWorkspacePanelLayoutVisibility({
      isMobile: true,
      isFullscreen: false,
      maximized: false,
      mobileImmersive: false,
      canvasOnlyMode: false,
      uiDensityMode: "simple",
      activeWorkspaceId: "lineart",
      leftPanelOpen: true,
      rightPanelOpen: true,
      forceRightPanelOpen: false,
    });
    expect(layout.canvasWideWorkspaceDensityMode).toBe("simple");
    expect(layout.rightPanelDensityAllows).toBe(false);
    expect(layout.visibleRightPanelOpen).toBe(false);
  });
});

