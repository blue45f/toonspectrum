import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);

describe("StudioPage tool transition boundary", () => {
  it("clears every transient Inspector pointer owner through one central disarm", () => {
    const start = studioPageSource.indexOf("function disarmAllPixelTools()");
    const end = studioPageSource.indexOf(
      "disarmAllPixelToolsRef.current = disarmAllPixelTools;",
      start,
    );
    const disarm = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    for (const cleanup of [
      "setAdvancedFillActive(false);",
      "setAdvancedFillBusy(false);",
      "setAdvancedFillPreview(null);",
      "setAutoColorScribbleCanvasArmed(false);",
      "setPixelTool(null);",
      "clearPolyLassoDraft();",
      "setColorRangePickActive(false);",
      "setQuickMaskActive(false);",
      "setSmudgeActive(false);",
      "setDodgeBurnActive(false);",
      "setWetMixActive(false);",
      "setLiquifyActive(false);",
      "setHealCloneTool(null);",
      "setHistoryBrushActive(false);",
      "setLayerMaskPaintActive(false);",
      "setFilterMaskPaintActive(false);",
      "setCropRect(null);",
      "setPuppetWarpActive(false);",
      "setEyedropperActive(false);",
      "setQuickShapeActive(false);",
      "setNodeEditTool(null);",
      "setBubbleAnchorPickActive(false);",
      "setBubbleShapeEditActive(false);",
      "setPanelSplitActive(false);",
    ]) {
      expect(disarm, cleanup).toContain(cleanup);
    }
  });

  it("does not run cross-tool disarm side effects from the bubble-anchor state updater", () => {
    const start = studioPageSource.indexOf("function toggleBubbleAnchorPick()");
    const end = studioPageSource.indexOf("function detachBubbleAnchor()", start);
    const handler = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("const next = !bubbleAnchorPickActive;");
    expect(handler).toContain("if (next) disarmAllPixelTools();");
    expect(handler).toContain("setBubbleAnchorPickActive(next);");
    expect(handler).not.toContain("setBubbleAnchorPickActive((");
  });

  it("marks only the synthetic blank-page color target as an intentional whole-canvas fill", () => {
    expect(studioPageSource).toContain(
      "intentionalWholeCanvasFill: vectorTarget?.sourceElementCount === 0,",
    );
  });

  it("arms fill without forcing a collapsed inspector open and changing the fitted canvas scale", () => {
    const start = studioPageSource.indexOf("function toggleAdvancedFill()");
    const end = studioPageSource.indexOf(
      "function updateAdvancedFillSettings(",
      start,
    );
    const fillTransition = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(
      fillTransition.match(
        /selectInspectorRoute\(\{ primary: "properties", image: "fill" \}\);/gu,
      ),
    ).toHaveLength(2);
    expect(fillTransition).not.toContain(
      'openInspectorRoute({ primary: "properties", image: "fill" }, null)',
    );
    expect(fillTransition).not.toContain("setZoom(");
  });

  it("makes the eyedropper shortcut disarm any previous canvas owner before activation", () => {
    const start = studioPageSource.indexOf(
      'if (matchStudioShortcut(sc["tool-eyedropper"], e))',
    );
    const end = studioPageSource.indexOf(
      'if (matchStudioShortcut(sc["tool-lasso"], e))',
      start,
    );
    const shortcut = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(shortcut).toContain(
      "const nextEyedropperActive = !eyedropperActive;",
    );
    expect(shortcut).toContain(
      "if (nextEyedropperActive) disarmAllPixelTools();",
    );
    expect(shortcut).toContain(
      "setEyedropperActive(nextEyedropperActive);",
    );
    expect(shortcut).not.toContain("setEyedropperActive((");
  });

  it("disarms the previous canvas owner before top-menu drawing mode transitions", () => {
    const start = studioPageSource.indexOf("selectDrawMode: (mode) => {");
    const end = studioPageSource.indexOf("},\n        },", start);
    const drawingMenu = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(drawingMenu).toContain(
      "studioMainMenuActions.disarmAllPixelTools();",
    );
    expect(drawingMenu).toContain('setTool("draw");');
    expect(drawingMenu).toContain("setQuickShapeActive(true);");
    expect(drawingMenu.match(/studioMainMenuActions\.disarmAllPixelTools\(\);/gu))
      .toHaveLength(2);
  });

  it("disarms transient right-panel tools before tutorial drawing actions", () => {
    const start = studioPageSource.indexOf(
      "function handleTutorialTry(action: StudioTutorialTryAction)",
    );
    const end = studioPageSource.indexOf(
      "const [quickStartDismissed",
      start,
    );
    const tutorial = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    for (const action of ["pen", "smart-shape", "brush"]) {
      const caseStart = tutorial.indexOf(`case "${action}":`);
      const caseEnd = tutorial.indexOf("break;", caseStart);
      const branch = tutorial.slice(caseStart, caseEnd);
      expect(caseStart).toBeGreaterThanOrEqual(0);
      expect(branch).toContain("disarmAllPixelTools();");
      expect(branch).toContain('setTool("draw");');
    }
  });

  it("disarms transient right-panel tools before options-bar and context-menu drawing actions", () => {
    const optionsStart = studioPageSource.indexOf(
      "const studioOptionsBarsHandlers = useStudioStableHandlers",
    );
    const optionsEnd = studioPageSource.indexOf(
      "const studioOptionsBarsDrawModel",
      optionsStart,
    );
    const options = studioPageSource.slice(optionsStart, optionsEnd);
    const contextStart = studioPageSource.indexOf("<StudioCanvasContextMenu");
    const contextEnd = studioPageSource.indexOf("</Container>", contextStart);
    const contextMenu = studioPageSource.slice(contextStart, contextEnd);

    expect(optionsStart).toBeGreaterThanOrEqual(0);
    expect(optionsEnd).toBeGreaterThan(optionsStart);
    expect(options).toMatch(
      /setDrawMode: \(mode\) => \{\s+disarmAllPixelTools\(\);\s+setTool\("draw"\);/u,
    );
    const brushSettingsStart = options.indexOf("openBrushStudio: () => {");
    const brushSettingsEnd = options.indexOf("recallBrushSlot:", brushSettingsStart);
    const brushSettings = options.slice(brushSettingsStart, brushSettingsEnd);
    expect(brushSettingsStart).toBeGreaterThanOrEqual(0);
    expect(brushSettingsEnd).toBeGreaterThan(brushSettingsStart);
    expect(brushSettings).toContain("void loadStudioBrushStudio();");
    expect(brushSettings).toContain("openInspectorRoute(");
    expect(brushSettings).not.toContain("disarmAllPixelTools();");
    expect(brushSettings).not.toContain('setTool("draw");');
    expect(brushSettings).not.toContain('setDrawMode("pen");');
    expect(options).not.toContain("setEraseToIntersection((prev) =>");

    expect(contextStart).toBeGreaterThanOrEqual(0);
    expect(contextEnd).toBeGreaterThan(contextStart);
    expect(contextMenu.match(/disarmAllPixelTools\(\);/gu)).toHaveLength(2);
    expect(contextMenu).toContain("onSelectPen={() => {");
    expect(contextMenu).toContain("onEnableQuickShape={() => {");
  });

  it("routes mobile and keyboard primary tools through one stroke-safe transition", () => {
    const transitionStart = studioPageSource.indexOf(
      "function activatePrimaryCanvasTool(",
    );
    const transitionEnd = studioPageSource.indexOf(
      "function readActiveStrokeLifecycleRecovery()",
      transitionStart,
    );
    const transition = studioPageSource.slice(transitionStart, transitionEnd);
    const shortcutsStart = studioPageSource.indexOf(
      'if (matchStudioShortcut(sc["tool-select"], e))',
    );
    const shortcutsEnd = studioPageSource.indexOf(
      'if (matchStudioShortcut(sc["tool-fill"], e))',
      shortcutsStart,
    );
    const shortcuts = studioPageSource.slice(shortcutsStart, shortcutsEnd);
    const escapeStart = studioPageSource.indexOf(
      '} else if (e.key === "Escape") {',
      studioPageSource.indexOf("shortcutRef.current ="),
    );
    const escapeEnd = studioPageSource.indexOf(
      "} else if (e.key ===",
      escapeStart + 1,
    );
    const escape = studioPageSource.slice(escapeStart, escapeEnd);

    expect(transitionStart).toBeGreaterThanOrEqual(0);
    expect(transitionEnd).toBeGreaterThan(transitionStart);
    expect(transition).toContain("executeStudioPrimaryCanvasToolTransition(");
    expect(transition).toContain("activeStroke: hasActiveDrawingPointerSession(),");
    expect(transition).toContain("cancelActiveStroke: discardDrawingPointerSession,");
    expect(transition).toContain("disarm: disarmAllPixelTools,");
    expect(transition).not.toContain("setZoom(");
    expect(transition).not.toContain("openInspectorRoute(");

    expect(shortcuts).toContain('activatePrimaryCanvasTool("select");');
    expect(shortcuts).toContain('activatePrimaryCanvasTool("draw", "pen");');
    expect(shortcuts).toContain('activatePrimaryCanvasTool("draw", "eraser");');

    expect(escapeStart).toBeGreaterThanOrEqual(0);
    expect(escape).toContain("if (hasActiveDrawingPointerSession()) {");
    expect(escape).toContain("discardDrawingPointerSession();");
    expect(escape.indexOf("hasActiveDrawingPointerSession()"))
      .toBeLessThan(escape.indexOf("mobileSheet"));
  });
});
