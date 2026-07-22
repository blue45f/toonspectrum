import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const globalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
const perspectiveSource = readFileSync(new URL("./StudioPerspectiveOverlay.tsx", import.meta.url), "utf8");
const isometricSource = readFileSync(new URL("./StudioIsometricGridOverlay.tsx", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("./StudioCanvasGuideLayers.tsx", import.meta.url), "utf8");

function studioPageSourceBetween(startMarker: string, endMarker: string): string {
  const start = studioPageSource.indexOf(startMarker);
  const end = studioPageSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return studioPageSource.slice(start, end);
}

describe("Studio canvas cursor integration boundary", () => {
  it("projects pan cursors to the workspace and precision cursors only to the paper", () => {
    expect(studioPageSource).toContain("studioCanvasViewportCursorClassName(canvasCursorInput)");
    expect(studioPageSource).toContain("studioCanvasCursorClassName(canvasCursorInput)");
    expect(studioPageSource).toContain("data-studio-comment-placement-active={commentPinArmed");
    expect(studioPageSource).toContain("data-studio-viewport-cursor={viewportCursorClassName");
    expect(studioPageSource).toContain("data-studio-canvas-cursor={canvasCursorClassName");
  });

  it("wires saved brush cursor preferences to a renderer-specific contact cursor", () => {
    const authoritativeMove = studioPageSourceBetween(
      "onAuthoritativeMove: (pointerEvent) => {",
      "onRawPreviewMove: (pointerEvent) => {",
    );
    const rawUpdate = studioPageSourceBetween(
      "onRawPreviewMove: (pointerEvent) => {",
      "onDiscard: () => {",
    );
    const cursorRenderer = studioPageSourceBetween(
      "function drawBrushCursorLayer(deferToFrame: boolean)",
      "// 포인터가 캔버스를 벗어나면 브러시 커서 프리뷰를 숨긴다.",
    );
    const snapshot = authoritativeMove.indexOf(
      "const coordinateMapper = stagePointerFrameMapperCacheRef.current!.mapperFor(stage);",
    );
    const contactPoint = authoritativeMove.indexOf(
      "const contactPoint = coordinateMapper.pointFor(pointerEvent);",
    );
    const consume = authoritativeMove.indexOf("consumeFreehandPointerBatch(");
    const cursor = authoritativeMove.indexOf(
      "updateBrushCursor(stage, pointerEvent, contactPoint, true);",
    );

    expect(studioPageSource).toContain(
      "const brushCursorStyle = appSettings.general.brushCursorStyle"
    );
    expect(studioPageSource).toContain("brushCursorStyle !== \"none\"");
    expect(studioPageSource).toContain("<StudioBrushCursor");
    expect(studioPageSource).toContain("brushId={drawMode === \"eraser\" ? \"eraser\" : brush}");
    expect(snapshot).toBeGreaterThanOrEqual(0);
    expect(contactPoint).toBeGreaterThan(snapshot);
    expect(consume).toBeGreaterThan(contactPoint);
    expect(cursor).toBeGreaterThan(consume);
    expect(authoritativeMove).toContain("{ coordinateMapper }");
    expect(authoritativeMove.match(/stagePointerFrameMapperCacheRef\.current!\.mapperFor\(stage\)/gu)).toHaveLength(1);
    expect(authoritativeMove.match(/coordinateMapper\.pointFor\(pointerEvent\)/gu)).toHaveLength(1);
    expect(rawUpdate.match(/stagePointerFrameMapperCacheRef\.current!\.mapperFor\(stage\)/gu)).toHaveLength(1);
    expect(rawUpdate.match(/coordinateMapper\.pointFor\(pointerEvent\)/gu)).toHaveLength(1);
    expect(studioPageSource).toContain("createStudioStagePointerFrameMapperCache({");
    expect(studioPageSource).toContain("stagePointerFrameMapperCacheRef.current?.invalidate();");
    expect(studioPageSource).toContain("stagePointerFrameMapperCacheRef.current?.dispose();");
    expect(rawUpdate).toContain("replaceStudioRawPenInkPreview(rawState, {");
    expect(rawUpdate).toContain("rawTransition.predictionSurface");
    expect(rawUpdate).toContain("updateBrushCursor(stage, pointerEvent, contactPoint, true);");
    expect(rawUpdate).not.toContain("consumeFreehandPointerBatch(");
    expect(rawUpdate).not.toContain("drawingRef.current =");
    expect(rawUpdate).not.toContain("appendDrawingCrdtSampleSuffix(");
    expect(rawUpdate).not.toContain("scheduleDraft(");
    expect(studioPageSource).toContain(
      "STUDIO_TRANSIENT_PEN_INK_SURFACE_ENABLED && webGpuViewportSurface",
    );
    expect(cursorRenderer).toContain("if (brushCursorDrawRafRef.current !== null) return;");
    expect(cursorRenderer).toContain("globalThis.requestAnimationFrame(() => {");
    expect(cursorRenderer.match(/brushCursorRef\.current\?\.getLayer\(\)\?\.drawScene\(\)/gu)).toHaveLength(2);
    expect(studioPageSource).toContain("drawBrushCursorLayer(deferToFrame);");
    expect(studioPageSource).toContain("if (!nativeFreehandMoveOwnsCursor)");
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
