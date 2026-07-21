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

describe("studio draw pointer-start planning ownership boundary", () => {
  it("keeps the planner renderer-, browser-, state-, collaboration-, and history-free", () => {
    const planner = moduleFacts("./studio-draw-pointer-start-plan.ts");

    expect(planner.imports).not.toContain("react");
    expect(planner.imports).not.toContain("konva");
    expect(planner.imports).not.toContain("react-konva");
    expect(planner.imports.some((path) => /(?:crdt|history|collaboration|client)/u.test(path))).toBe(false);
    expect(planner.source).not.toMatch(
      /\b(?:window|document|localStorage|sessionStorage|PointerEvent|MouseEvent|TouchEvent)\b/u
    );
    for (const pageOwnedAction of [
      "uid(",
      "beginLiveResourceEdit(",
      "endLiveResourceEdit(",
      "beginStudioStrokePointerSession(",
      "beginStroke(",
      "appendStrokeSamples(",
      "scheduleDraft(",
      "commit(",
      "setState(",
      "setSelectedId(",
    ]) {
      expect(planner.source).not.toContain(pageOwnedAction);
    }
    expect(planner.source.split("\n").length).toBeLessThanOrEqual(260);
  });

  it("leaves gesture priority, leases, transport, CRDT publication, and live surfaces in the Page", () => {
    const page = moduleFacts("./StudioPage.tsx").source;
    const start = page.indexOf("function onStageDown");
    const end = page.indexOf("// 복구 브러시/도장 호버 커서", start);
    const onStageDown = page.slice(start, end);
    const pointCommentStart = page.indexOf("function handleStudioPointCommentStageDown");
    const pointCommentHandler = page.slice(pointCommentStart, start);

    expect(page).toContain('from "./studio-draw-pointer-start-plan"');
    expect(onStageDown).toContain(
      "if (handleStudioPointCommentStageDown(e, stagePointerEvent)) return;"
    );
    expect(onStageDown).not.toContain("setPointCommentComposer({");
    expect(onStageDown).toContain("planStudioDrawPointerStart({");
    expect(onStageDown).toContain("id: uid()");
    expect(onStageDown).toContain("pointer: pointerSample");
    expect(onStageDown).not.toContain("const causalInputPolicy =");
    expect(onStageDown).not.toContain("const layeredFlowPaintEligible =");
    expect(onStageDown).not.toContain("const common = {");
    expect(onStageDown).not.toContain("const next: DrawEl =");
    expect(onStageDown.split("\n").length).toBeLessThanOrEqual(780);

    expectTokenOrder(pointCommentHandler, [
      "if (pointCommentComposer) return true",
      "if (!commentPinArmed) return false",
      "if (canvasInteractionBlocked)",
      "stagePointerEvent.isPrimary === false",
      'type: "point" as const',
      "x: Math.min(1, Math.max(0, pos.x / CANVAS_W))",
      "y: Math.min(1, Math.max(0, pos.y / canvasH))",
      "getClientPointFromKonvaEvent(e.evt)",
      'setStudioCommentPlacementPhase("composing")',
      'commentId: createStudioCommentMessageId("comment")',
      "screenPoint: clientPoint",
    ]);

    expectTokenOrder(onStageDown, [
      "if (!studioCrdtDocumentRef.current && !beginLiveResourceEdit()) return",
      "beginStudioStrokePointerSession(pointerSample)",
      "drawingInputSettingsRef.current = {",
      "planStudioDrawPointerStart({",
      "scheduleLiveDrawPressure(pressure)",
      "requireStudioDrawingPointerTransport(drawingPointerTransportRef).start({",
      "drawingImmediateCausalInputRef.current = causalInputPlan.quantizeImmediately",
      "crdtDocument.beginStroke(studioDrawElementToCrdtStroke(activePage.id, next))",
      "drawingRef.current = next",
      "flushDirectLiveDraftNow(next)",
      "startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp)",
    ]);
  });
});
