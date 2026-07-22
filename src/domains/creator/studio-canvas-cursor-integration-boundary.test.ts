import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
const perspectiveSource = readFileSync(new URL("./StudioPerspectiveOverlay.tsx", import.meta.url), "utf8");
const isometricSource = readFileSync(new URL("./StudioIsometricGridOverlay.tsx", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("./StudioCanvasGuideLayers.tsx", import.meta.url), "utf8");

describe("Studio canvas cursor integration boundary", () => {
  it("projects pan cursors to the workspace and precision cursors only to the paper", () => {
    expect(studioPageSource).toContain("studioCanvasViewportCursorClassName(canvasCursorInput)");
    expect(studioPageSource).toContain("studioCanvasCursorClassName(canvasCursorInput)");
    expect(studioPageSource).toContain("data-studio-comment-placement-active={commentPinArmed");
    expect(studioPageSource).toContain("data-studio-viewport-cursor={viewportCursorClassName");
    expect(studioPageSource).toContain("data-studio-canvas-cursor={canvasCursorClassName");
  });

  it("wires saved brush cursor preferences to a renderer-specific contact cursor", () => {
    expect(studioPageSource).toContain(
      "const brushCursorStyle = appSettings.general.brushCursorStyle"
    );
    expect(studioPageSource).toContain("brushCursorStyle !== \"none\"");
    expect(studioPageSource).toContain("<StudioBrushCursor");
    expect(studioPageSource).toContain("brushId={drawMode === \"eraser\" ? \"eraser\" : brush}");
    expect(studioPageSource).toContain(
      "updateBrushCursor(e.target.getStage(), e.evt as PointerEvent)"
    );
    expect(studioPageSource).not.toContain("Hide the hover-only size preview");
  });

  it("shows the comment cursor only while the resolved paper cursor is a usable crosshair", () => {
    expect(globalsSource).toContain('@media (pointer: fine)');
    expect(globalsSource).toContain(
      '[data-studio-comment-placement-active="true"][data-studio-canvas-cursor="crosshair"] canvas'
    );
    expect(globalsSource).toContain('9 9, crosshair !important');
  });

  it.each(["tool-select", "tool-pen", "tool-eraser", "tool-pixel"])(
    "disarms transient editing tools before the %s shortcut changes the base tool",
    (shortcut) => {
      const shortcutStart = studioPageSource.indexOf(`matchStudioShortcut(sc["${shortcut}"], e)`);
      expect(shortcutStart).toBeGreaterThan(-1);
      const shortcutBlock = studioPageSource.slice(shortcutStart, shortcutStart + 360);
      expect(shortcutBlock.indexOf("disarmAllPixelTools();")).toBeGreaterThan(-1);
      expect(shortcutBlock.indexOf("disarmAllPixelTools();")).toBeLessThan(
        shortcutBlock.indexOf("setTool(")
      );
    }
  );

  it("lets guide handles restore the inherited mode cursor after hover", () => {
    for (const source of [perspectiveSource, isometricSource, guideSource]) {
      expect(source).not.toContain('style.cursor = "default"');
      expect(source).toContain('style.cursor = ""');
    }
  });
});
