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
    // 의도적 변경(2026-07-24): CSP pressure min size — linear residual bake-at-capture
    // minSizeRatio 배선으로 플래너 순수 모듈 라인 증가(260 → 265).
    expect(planner.source.split("\n").length).toBeLessThanOrEqual(265);
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
    // 의도적 변경(2026-07-24): 필터 마스크 페인팅 툴 배선 — onStageDown 에 레이어 마스크와
    // 대칭인 필터 마스크 armed 포인터다운 분기를 추가(900 → 915).
    // 의도적 변경(2026-07-24): 선택 도구 대상 재획득 — 선택된 이미지 밖에서 시작했는데 그 자리에
    // 다른 편집 가능한 이미지가 있으면 대상을 옮긴다(선택이 간헐적으로 안 되던 버그 수정, 915 → 935).
    // 의도적 변경(2026-07-24): 그룹 선택 = 하나의 단위(PPT/Figma) — 빈 영역 클릭 시 그룹 진입 상태도
    // 함께 해제(activeGroupIdRef/setActiveGroupId)하는 분기를 deselect 경로에 추가(935 → 936).
    // 의도적 변경(2026-07-24): CSP pressure min size — resolveBrushPressureSample/minSizeRatio 배선
    // 및 시작 플랜 입력 전달로 onStageDown 증가(936 → 940).
    // 의도적 변경(2026-07-24): CSP 교점까지 지우기 원샷 분기(지우개+토글) 추가(940 → 945).
    expect(onStageDown.split("\n").length).toBeLessThanOrEqual(945);

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
      "drawingRef.current = next",
      "flushDirectLiveDraftNow(next)",
      "drawingCrdtPublisherRef.current.begin(next.id",
      "startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp)",
    ]);
  });
});
