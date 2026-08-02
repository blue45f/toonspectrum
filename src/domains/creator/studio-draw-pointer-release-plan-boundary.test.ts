import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleFacts {
  imports: string[];
  source: string;
}

function moduleFacts(fileName: string): ModuleFacts {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports: string[] = [];
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return { imports, source };
}

function expectTokenOrder(value: string, tokens: readonly string[]): void {
  let cursor = -1;
  for (const token of tokens) {
    const index = value.indexOf(token, cursor + 1);
    expect(index, `missing or out-of-order token: ${token}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

describe("studio draw pointer-release planning ownership boundary", () => {
  it("keeps the planner pure and free of pointer, renderer, collaboration, and history I/O", () => {
    const planner = moduleFacts("./studio-draw-pointer-release-plan.ts");

    expect(planner.imports).toEqual([
      "./studio-brush",
      "./studio-draw-completion",
      "./studio-pixel-pencil",
      "./studio-quickshape-release-promotion",
      "./studio-element-model",
      "./studio-smart-shape-brush-effect",
    ]);
    expect(planner.source).not.toMatch(/from\s+["'](?:react|konva|react-konva)/u);
    expect(planner.source).not.toMatch(
      /\b(?:window|document|globalThis|PointerEvent|MouseEvent|TouchEvent|CanvasRenderingContext2D)\b/u
    );
    for (const pageOwnedAction of [
      "drawingRef",
      "studioCrdt",
      "appendStrokeSamples(",
      "deleteStroke(",
      "queueDeferredStrokeCommit(",
      "commit(",
      "draftPreviewStoreRef",
      "liveInkOverlayRendererRef",
      "webGpuCanvasHandleRef",
      "pendingStrokeCommitsRef",
      "announceDrawingShortcut(",
      "setError(",
    ]) {
      expect(planner.source).not.toContain(pageOwnedAction);
    }
    expect(planner.source.split("\n").length).toBeLessThanOrEqual(180);
  });

  it("leaves release capture, CRDT sealing, surfaces, commit recovery, and cleanup in StudioPage", () => {
    const page = moduleFacts("./StudioPage.tsx").source;
    const start = page.indexOf("function finishDrawingPointer");
    const end = page.indexOf("function onStagePointerCancel", start);
    const finish = page.slice(start, end);
    const sealStart = page.indexOf("function sealStudioDrawReleaseInput");
    const sealEnd = page.indexOf("function finishStudioSpecialistStroke", sealStart);
    const sealInput = page.slice(sealStart, sealEnd);
    const specialistEnd = page.indexOf("function finishDrawingPointer", sealEnd);
    const specialistRelease = page.slice(sealEnd, specialistEnd);

    expect(page).toContain('from "./studio-draw-pointer-release-plan"');
    expect(finish).toContain("planStudioDrawPointerRelease({");
    expect(finish).not.toContain("promoteFreehandQuickShapeOnRelease(");
    expect(finish).not.toContain("smoothStrokePoints(");
    expect(finish).not.toContain("isStudioImmediateFreehandCommit(");
    expect(finish).not.toContain("let finished = drawingRef.current");
    expect(finish.split("\n").length).toBeLessThanOrEqual(400);
    expect(sealStart).toBeGreaterThan(-1);
    expectTokenOrder(sealInput, [
      "updateActiveShapeEndpoint(stage, pointerEvent, false)",
      "consumeFreehandPointerBatch(stage, pointerEvent, false",
      'transitionFixedRateStrokeFilter(fixedRateState, { type: "release" })',
      "appendDrawingCrdtSampleSuffix(drawingRef.current, crdtReleaseSampleStart)",
      "sealCausalPostCorrectionState(drawingRef.current)",
      "authoritativeLiveStroke = drawingRef.current",
      "flushDirectLiveDraftNow(authoritativeLiveStroke)",
    ]);
    expect(specialistRelease).toContain("finishStudioLivingInkStroke(livingInkStroke, finished)");
    expect(specialistRelease).toContain("finishStudioHokusaiLiveStroke(hokusaiStroke, finished)");

    expectTokenOrder(finish, [
      "stopFixedRateStrokePump()",
      "authoritativeLiveStroke = sealStudioDrawReleaseInput(",
      "isCompleteStudioDrawOp(drawingRef.current)",
      "const overlayRenderer = liveInkOverlayRendererRef.current",
      "planStudioDrawPointerRelease({",
      "announceDrawingShortcut(`스마트 도형",
      "finishStudioSpecialistStroke(finished)",
      'releasePlan.commitMode === "deferred"',
      "queueDeferredStrokeCommit(finished)",
      "const committed = commit([...baseElements, finished])",
      "restorePendingStrokeCommits({",
      "studioCrdtDocumentRef.current?.deleteStroke(drawingRef.current.id)",
      "finally {",
      "releaseDrawingPointerSession()",
      "clearDraftPreview({ preserveInkForDeferredCommit: deferInkCleanup })",
      "reauthorLastSettledFromDocumentPoints",
      "liveBrushPressureSamplesFor(releaseAuthoritativeStroke)",
      "endLiveResourceEdit()",
    ]);
    // Reauthor must feed alias-mapped live pressures, not raw DrawEl.pressures — otherwise
    // fineliner/marker strokes flash a different dab radius at stroke complete.
    const reauthorCall = finish.slice(
      finish.indexOf("reauthorLastSettledFromDocumentPoints")
    );
    expect(reauthorCall).toContain("liveBrushPressureSamplesFor(releaseAuthoritativeStroke)");
    expect(reauthorCall).not.toContain("pressures: releaseAuthoritativeStroke.pressures");
  });
});
