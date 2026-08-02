import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const brushBaselineControllerSource = readFileSync(
  new URL("./useStudioBrushBaselineController.ts", import.meta.url),
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
    expect(disarm).toContain("cancelPixelSelectionPointerSession();");
    expect(disarm).toContain("pixelWandRunIdRef.current += 1;");
    expect(disarm).toContain("pixelWandActiveRunIdRef.current = null;");
    expect(disarm).toContain("colorRangeActiveRunIdRef.current !== null");
    expect(disarm).toContain("colorRangeRunIdRef.current += 1;");
    expect(disarm).toContain("colorRangeActiveRunIdRef.current = null;");
    expect(disarm).toContain("setPixelBusy(false);");
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

  it("runs Color Range selection as one abortable Worker-owned operation", () => {
    const start = studioPageSource.indexOf(
      "async function runColorRangeApply(",
    );
    const end = studioPageSource.indexOf(
      "// ── 픽셀 선택 한정 조정 적용",
      start,
    );
    const apply = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(apply).toContain("colorRangeAbortRef.current?.abort();");
    expect(apply).toContain("const controller = new AbortController();");
    expect(apply).toContain(
      'await import("./studio-color-range-browser")',
    );
    expect(apply).toContain("colorRangeSelectionFromImage(");
    expect(apply).toContain("signal: controller.signal");
    expect(apply).toContain(
      "const currentSelectionSnapshot = pixelSelRef.current;",
    );
    expect(apply).toContain("const selectionSnapshot = selectionOperationBase(");
    expect(apply).toContain("currentSelectionSnapshot,");
    expect(apply).toContain("selection: selectionSnapshot,");
    expect(apply).toContain(
      "pixelSelRef.current !== currentSelectionSnapshot",
    );
    expect(apply).not.toContain("pixelSelRef.current !== selectionSnapshot");
    expect(apply).not.toContain("applyColorRangeMaskToSelection(");
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

  it("routes top-menu drawing modes through the stroke-safe primary transition", () => {
    const start = studioPageSource.indexOf("selectDrawMode: (mode) => {");
    const end = studioPageSource.indexOf("},\n        },", start);
    const drawingMenu = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(drawingMenu).toContain(
      'studioMainMenuActions.activatePrimaryCanvasTool("draw", mode);',
    );
    expect(drawingMenu).toContain("setQuickShapeActive(true);");
    expect(
      drawingMenu.match(
        /studioMainMenuActions\.activatePrimaryCanvasTool\("draw", (?:mode|"pen")\);/gu,
      ),
    )
      .toHaveLength(2);
  });

  it("routes tutorial drawing actions through the stroke-safe primary transition", () => {
    const start = studioPageSource.indexOf("function handleTutorialTry(");
    const end = studioPageSource.indexOf(
      "const [quickStartDismissed",
      start,
    );
    const tutorial = studioPageSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    for (const action of ["pen", "smart-shape"]) {
      const caseStart = tutorial.indexOf(`case "${action}":`);
      const caseEnd = tutorial.indexOf("break;", caseStart);
      const branch = tutorial.slice(caseStart, caseEnd);
      expect(caseStart).toBeGreaterThanOrEqual(0);
      expect(branch).toContain('activatePrimaryCanvasTool("draw", "pen");');
    }

    const brushStart = tutorial.indexOf('case "brush":');
    const brushEnd = tutorial.indexOf("break;", brushStart);
    expect(tutorial.slice(brushStart, brushEnd)).toContain(
      "openBrushCatalogFromHelp(trigger);",
    );
    const catalogStart = studioPageSource.indexOf(
      "function openBrushCatalogFromHelp(",
    );
    const catalogEnd = studioPageSource.indexOf(
      "function closeBuiltInBrushCatalog(",
      catalogStart,
    );
    expect(studioPageSource.slice(catalogStart, catalogEnd)).toContain(
      'activatePrimaryCanvasTool("draw", "pen");',
    );
  });

  it("routes saved, catalogue, and slot brush application through the same transition", () => {
    for (const [startMarker, endMarker, drawModeSource] of [
      [
        "function applySavedBrush(",
        "function applyStudioBrushCatalogSelection(",
        "resolveStudioBrushPresetDrawMode(saved.brushId)",
      ],
      [
        "function applyStudioBrushCatalogSelection(",
        "function applyBuiltInBrushPreset(",
        'selection.drawMode ?? "pen"',
      ],
      [
        "function applyBrushSlot(",
        "function applyDynamicsPreset(",
        "resolveStudioBrushPresetDrawMode(slot.brushId)",
      ],
    ] as const) {
      const start = studioPageSource.indexOf(startMarker);
      const end = studioPageSource.indexOf(endMarker, start);
      const branch = studioPageSource.slice(start, end);

      expect(start, startMarker).toBeGreaterThanOrEqual(0);
      expect(end, endMarker).toBeGreaterThan(start);
      expect(branch).toContain("activatePrimaryCanvasTool(");
      expect(branch).toContain('"draw",');
      expect(branch).toContain(drawModeSource);
      expect(branch).not.toContain('setTool("draw");');
      expect(branch).not.toContain('setDrawMode("pen");');
    }
  });

  it("delegates brush baseline ownership while preserving fresh one-step undo validation", () => {
    expect(studioPageSource).toContain(
      'import { useStudioBrushBaselineController } from "./useStudioBrushBaselineController";',
    );
    expect(studioPageSource).toContain(
      "const brushBaselineController = useStudioBrushBaselineController({",
    );
    expect(studioPageSource).toContain(
      "void brushBaselineController.restoreDefaults();",
    );
    expect(studioPageSource).not.toContain(
      'import("./studio-brush-baseline-contract")',
    );
    expect(
      brushBaselineControllerSource.match(
        /return import\("\.\/studio-brush-baseline-contract"\);/gu,
      ),
    ).toHaveLength(1);
    expect(brushBaselineControllerSource).not.toContain('from "./StudioPage"');
    expect(brushBaselineControllerSource).not.toContain('import("./StudioPage")');

    const start = brushBaselineControllerSource.indexOf(
      "async function restoreDefaults(): Promise<void>",
    );
    const end = brushBaselineControllerSource.indexOf(
      "\n  return {",
      start,
    );
    const restore = brushBaselineControllerSource.slice(start, end);
    const freshInspection = restore.indexOf(
      "contract.inspectStudioBrushBaseline(",
    );
    const undoBranch = restore.indexOf(
      "if (requestedUndo && previousRestore)",
    );
    const undoApply = restore.indexOf(
      'previousRestore.transaction,\n            "undo",',
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(freshInspection).toBeGreaterThanOrEqual(0);
    expect(undoBranch).toBeGreaterThan(freshInspection);
    expect(undoApply).toBeGreaterThan(undoBranch);
    expect(restore).toContain(
      "브러시 설정이 바뀌어 이전 복원 되돌리기를 취소했어요.",
    );
  });

  it("routes options-bar and context-menu drawing actions through the stroke-safe transition", () => {
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
      /setDrawMode: \(mode\) => \{\s+activatePrimaryCanvasTool\("draw", mode\);/u,
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
    expect(
      contextMenu.match(/activatePrimaryCanvasTool\("draw", "pen"\);/gu),
    ).toHaveLength(2);
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
