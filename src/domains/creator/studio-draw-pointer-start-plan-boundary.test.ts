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
    // 의도적 변경(2026-07-27): CSP pressure min size + brush-family input cadence remain pure
    // capture-time policy. The bounded-flow-v2 paint-model snapshot adds a small, explicit
    // capture contract, while renderer ownership still remains outside this pure planner.
    // 의도적 변경(2026-07-29): 비-G펜 계열별 하이브리드 필압의 첫 접촉 정책을 같은 순수
    // capture planner에 고정한다. 라이브 append와 저장 replay가 동일한 명목 필압에서 시작한다.
    // 의도적 변경(2026-08-09): calligraphy authoring tip을 시작 스냅샷에 보존한다(310 → 315).
    expect(planner.source.split("\n").length).toBeLessThanOrEqual(315);
  });

  it("leaves gesture priority, leases, transport, CRDT publication, and live surfaces in the Page", () => {
    const page = moduleFacts("./StudioPage.tsx").source;
    const start = page.indexOf("function onStageDown");
    const end = page.indexOf("// 복구 브러시/도장 호버 커서", start);
    const onStageDown = page.slice(start, end);
    const liveSurfaceStart = page.indexOf("function beginStudioDrawLiveSurfaces");
    const liveSurface = page.slice(liveSurfaceStart, start);
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
    // 의도적 변경(2026-07-24): auto-color 캔버스 시드 찍기 분기 추가(945 → 1_000).
    // 의도적 변경(2026-07-24): CSP 스트로크/도형 객체 스냅 — stroke origin reauthor after plan (1_000 → 1_050).
    // 의도적 변경(2026-07-27): 벡터-only 문서의 첫 픽셀 선택 제스처를 합성 준비 동안
    // journal/replay하고 도구 전환 시 안전하게 취소하는 경계 추가(1_050 → 1_120).
    // 의도적 변경(2026-07-29): 시작 플랜의 계열별 필압 설정 전달을 명시(1_120 → 1_130).
    // 의도적 변경(2026-08-03): specialist/native/GPU 표면 admission과 presentation을
    // beginStudioDrawLiveSurfaces로 추출해 onStageDown은 입력·CRDT 순서만 소유한다.
    expect(onStageDown.split("\n").length).toBeLessThanOrEqual(1_190);
    expect(liveSurfaceStart).toBeGreaterThan(-1);
    expect(liveSurface).toContain("const livingInkAdmitted =");
    expect(liveSurface).toContain("resolveStudioStrokeSurfaceRoute({");
    expect(liveSurface).toContain("flushDirectLiveDraftNow(next)");

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
      "beginStudioDrawLiveSurfaces(next, pointerSample, strokeOrigin)",
      "drawingCrdtPublisherRef.current.begin(next.id",
      "startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp)",
    ]);
  });
});
