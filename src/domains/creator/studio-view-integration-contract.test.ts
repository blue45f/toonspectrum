import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const viewportSource = readFileSync(new URL("./StudioCanvasViewport.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("./StudioInspectorAside.tsx", import.meta.url), "utf8");
const leftToolRailSource = readFileSync(new URL("./StudioLeftToolRail.tsx", import.meta.url), "utf8");
const viewHudLoaderSource = readFileSync(
  new URL("./studio-view-tools-hud-loader.ts", import.meta.url),
  "utf8",
);

describe("StudioPage view integration contract", () => {
  it("wires the quarter-turn Stage and transformed collaboration overlay together", () => {
    expect(viewportSource).toContain("width={stageViewLayout.width}");
    expect(viewportSource).toContain("rotation={stageViewLayout.rotation}");
    expect(viewportSource).toMatch(
      /<StudioRemoteCursorOverlay[\s\S]*?rotation=\{canvasRotation\}/u,
    );
  });

  it("fails GPU raster surfaces closed while a quarter-turn view is active", () => {
    expect(source).toMatch(
      /const webGpuViewportSurface = canvasRotation === 0[\s\S]*?planStudioWebGpuViewportSurface/u
    );
  });

  it("uses the common transform helpers for every DOM-to-document coordinate path", () => {
    expect(source).toContain("planStudioViewRotationTransition({");
    expect(source).toContain("planStudioViewScrollToDocumentPoint({");
    expect(source).toContain("projectStudioViewPointToDocument({");
    expect(source).toContain("projectStudioDocumentPointToView({");
    expect(inspectorSource).toContain("projectStudioViewRectToDocumentRect({");
  });

  it("keeps rotation out of automatic ResizeObserver fitting", () => {
    expect(source).toContain("w / studioViewDocumentWidthRef.current");
    expect(source).toContain(
      "[canvasOnlyMode, isFullscreen, maximized, mobileImmersive]"
    );
  });

  it("shows effective magnification and exposes an accessible rail-to-toolbar relationship", () => {
    expect(viewportSource).toContain("magnification={effScale}");
    expect(leftToolRailSource).toContain('aria-controls="studio-view-tools-hud-zoom"');
    expect(leftToolRailSource).toContain('data-studio-view-tool-trigger="rotate"');
  });

  it("keeps the legacy canvas zoom cluster out of the full editor dock", () => {
    expect(viewportSource).toMatch(
      /absolute bottom-3 left-3[\s\S]*?canvasOnlyMode && "lg:flex"[\s\S]*?aria-label="실제 픽셀 100% 보기"/u,
    );
    expect(viewportSource).not.toContain('"absolute bottom-3 left-3 z-30 hidden lg:flex');
  });

  it("loads the optional view HUD only after a zoom or rotate intent", () => {
    expect(viewportSource).toContain(
      'import { StudioViewToolsHud } from "./studio-view-tools-hud-loader";',
    );
    expect(viewportSource).not.toContain(
      'import { StudioViewToolsHud } from "./StudioViewToolsHud";',
    );
    expect(viewHudLoaderSource).toContain('import("./StudioViewToolsHud")');
    expect(viewportSource).toMatch(
      /\{viewTool \? \([\s\S]*?<Suspense fallback=\{null\}>[\s\S]*?<StudioViewToolsHud/u,
    );
  });

  it("restores focus when shortcut or capture state closes a focused view HUD", () => {
    expect(source).toContain("lastNonViewHudFocusRef");
    expect(source).toContain('target.closest("[data-studio-view-tools-hud]")');
    expect(source).toContain("if (!focusOwnedByHud || !restoreTarget) return;");
    expect(source).toContain("restoreTarget.focus({ preventScroll: true })");
    expect(source).toContain("closeViewToolWithFocusRef.current({ preferCanvas: true })");
    expect(source).toContain('if (viewTool === "zoom") closeViewToolWithFocus();');
    expect(source).toContain('if (viewTool === "rotate") closeViewToolWithFocus();');
    expect(viewportSource).toContain("onClose={closeViewToolWithFocus}");
  });

  it("keeps configurable flip dispatch before the hard-coded view resolver", () => {
    const configuredFlip = source.indexOf('matchStudioShortcut(sc["flip-canvas"], e)');
    const hardCodedViewResolver = source.indexOf("resolveStudioViewShortcut(e)");
    expect(configuredFlip).toBeGreaterThan(-1);
    expect(hardCodedViewResolver).toBeGreaterThan(configuredFlip);
  });

  it("preserves the visible document center around capture-only Stage normalization", () => {
    expect(source).toContain("captureSuppressedViewRef.current = captureStudioView({");
    expect(source).toContain("const viewTransformSuppressed = isExporting || saving || timelapseCapturing");
    expect(source).toContain("wrap.scrollLeft = restored.scrollLeft");
    expect(source).toContain("wrap.scrollTop = restored.scrollTop");

    const captureStarts = [
      ...source.matchAll(/set(?:IsExporting|Saving|TimelapseCapturing)\(true\)/gu),
    ];
    expect(captureStarts.length).toBeGreaterThan(0);
    for (const captureStart of captureStarts) {
      const index = captureStart.index ?? 0;
      expect(source.slice(Math.max(0, index - 180), index)).toContain(
        "preserveStudioViewBeforeCapture()"
      );
    }
  });
});
