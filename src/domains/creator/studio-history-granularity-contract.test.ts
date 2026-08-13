/**
 * 히스토리 신뢰 계약 — "⌘Z 한 번이 무엇을 되돌리는가"의 소스 계약.
 *
 * 브라우저 감사에서 셋이 함께 나왔다.
 *  E. 250ms 미만 간격의 획 3개가 undo 한 단계로 뭉쳐 통째로 사라졌다(해칭 전멸).
 *  B. 복구 배너의 "비우기"가 확인 없이 유일한 복구본을 영구 삭제했다.
 *  G. 캐릭터 바이블·Writer Room 편집 뒤의 ⌘Z 가 화면 밖 캔버스 획을 지웠다.
 *
 * 셋 다 "사용자가 만진 것과 다른 대상이 사라진다"는 같은 실패다. 여기서는 그 세 경로가
 * 다시 뒤집히지 않도록 StudioPage 의 해당 구간을 소스로 고정한다.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const catalogSource = readFileSync(
  new URL("./studio-destructive-command-catalog.ts", import.meta.url),
  "utf8",
);
const statusRailSource = readFileSync(
  new URL("./StudioCanvasStatusRail.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = studioPageSource.indexOf(start);
  const endIndex = studioPageSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return studioPageSource.slice(startIndex, endIndex);
}

describe("E — 지연 커밋 배치는 획 개수만큼의 히스토리 항목으로 들어간다", () => {
  it("flush 는 배치 커밋 뒤 히스토리를 획 단위로 펼친다", () => {
    const flush = sourceBetween(
      "flushPendingStrokeCommitsRef.current = () => {",
      "discardPendingStrokeCommitsRef.current = () => {",
    );

    // 발행·검증은 배치 단위 1회 그대로 — 획마다 commit() 을 부르면 같은 태스크의 장면 발행이
    // 겹쳐 "중복된 드로우 식별자"로 거절된다(브라우저 실측).
    expect(flush).toContain("commit([...baseElements, ...batch.strokes], undefined, batch.pageId)");
    expect(flush.indexOf("expandDeferredStrokeCommitHistory(batch)")).toBeGreaterThan(
      flush.indexOf("if (!committed)"),
    );
  });

  it("펼치기는 뒤쪽 획만 걷어낸 접두 스냅샷을 되돌려 끼운다", () => {
    const expand = sourceBetween(
      "function expandDeferredStrokeCommitHistory(batch: PendingStrokeCommitBatch)",
      "// 커밋 지연 파이프라인의 동기화/폐기",
    );

    expect(expand).toContain("if (batch.strokes.length < 2) return;");
    expect(expand).toContain("batch.strokes.slice(kept).map((stroke) => stroke.id)");
    expect(expand).toContain("page.elements.filter((element) => !dropped.has(element.id))");
    expect(expand).toContain("appendStudioPagesHistorySnapshot(accHistory, accIndex, snapshot)");
    expect(expand).toContain("recordStudioHistoryTransition({");
    // 기준 스냅샷이 상한에 밀려 사라졌으면 펼치지 않는다(엉뚱한 상태로 점프 금지).
    expect(expand).toContain("if (!finalPages || !basePages) return;");
    expect(expand).toContain("pagesHiRef.current = accIndex");
  });

  it("undo 는 대기 배치를 폐기하지 않고 먼저 히스토리에 안착시킨다", () => {
    const undo = sourceBetween("const undo = () => {", "const redo = () => {");

    expect(undo).toContain(
      "if (pendingStrokeCommitsRef.current && !flushPendingStrokeCommitsRef.current())",
    );
    // flush 는 ref 만 동기 전진시킨다 — 렌더 클로저의 pagesHi 를 읽으면 방금 안착한 획을
    // 건너뛰고 그 앞 스냅샷으로 점프한다.
    expect(undo).toContain("const undoHistory = pagesHistoryRef.current");
    expect(undo).toContain("const nextIndex = Math.max(0, undoIndex - 1)");
    expect(undo).not.toContain("Math.max(0, pagesHi - 1)");
    expect(undo).not.toContain("pagesHistory[nextIndex]");
  });
});

describe("B — 복구 배너의 비우기는 파괴 승인 seam을 지난다", () => {
  it("clearAutosave 는 되돌릴 수 없음 등급의 승인 트랜잭션으로 감싼다", () => {
    const clear = sourceBetween("async function clearAutosave()", "function downloadAutosaveBackup(");

    expect(clear).toContain("studioClearAutosaveRequest({");
    expect(clear).toContain("runStudioDestructiveAction({");
    expect(clear).toContain("clearAutosaveRecord();");
    // 승인 없이 저장소를 직접 지우는 경로가 남아 있으면 안 된다.
    expect(clear).not.toContain("localStorage.removeItem(autosaveKey)");
  });

  it("사라지는 페이지 수·요소 수를 실제 임시저장본에서 센다", () => {
    const clear = sourceBetween("async function clearAutosave()", "function downloadAutosaveBackup(");

    expect(clear).toContain("saved?.payload.pagesList ?? []");
    expect(clear).toContain("pageCount: savedPages.length");
    expect(clear).toContain("total + (page.elements?.length ?? 0)");
  });

  it("카탈로그 항목은 되돌릴 수 없음이며 안전한 취소 라벨을 준다", () => {
    const request = catalogSource.slice(
      catalogSource.indexOf("export function studioClearAutosaveRequest("),
    );
    const body = request.slice(0, request.indexOf("\n}\n") + 1);

    expect(body).toContain('id: "studio.autosave.clear"');
    expect(body).toContain('reversibility: "irreversible"');
    expect(body).toContain('cancelLabel: "그대로 두기"');
    expect(body).toContain("복구하기");
  });

  it("승인 창이 닫히면 포커스는 파괴 버튼이 아니라 복구 쪽으로 돌아간다", () => {
    expect(statusRailSource).toContain("const autosaveSafeActionRef = useRef<HTMLButtonElement | null>(null)");
    expect(statusRailSource).toContain("autosaveSafeActionRef.current?.focus()");
    expect(statusRailSource).toContain("onClick={requestClearAutosave}");
  });
});

describe("G — 히스토리 밖 사이드카 편집은 캔버스 undo로 새지 않는다", () => {
  it("사이드카 setter 가 배리어를 세우고 캔버스 커밋이 내린다", () => {
    expect(studioPageSource).toContain('sidecarHistoryBarrierRef.current = "캐릭터 바이블"');
    expect(studioPageSource).toContain('sidecarHistoryBarrierRef.current = "Writer Room"');

    const commit = sourceBetween("function commit(\n", "// 같은 key의 연속 동작이면");
    expect(commit).toContain("sidecarHistoryBarrierRef.current = null");

    const queue = sourceBetween(
      "function queueDeferredStrokeCommit(finished: DrawEl)",
      "const scheduleMarqueeRect =",
    );
    expect(queue).toContain("sidecarHistoryBarrierRef.current = null");
  });

  it("배리어가 서 있으면 undo 는 히스토리를 건드리지 않고 사실만 알린다", () => {
    const undo = sourceBetween("const undo = () => {", "const redo = () => {");
    const barrierIndex = undo.indexOf("const sidecarBarrier = sidecarHistoryBarrierRef.current");
    const historyIndex = undo.indexOf("const undoHistory = pagesHistoryRef.current");

    expect(barrierIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeGreaterThan(barrierIndex);
    expect(undo).toContain("실행 취소(⌘Z) 대상이 아니에요");
    // 1회성이어야 한다 — 영구 차단은 undo 자체를 못 쓰게 만드는 더 나쁜 실패다.
    expect(undo).toContain("sidecarHistoryBarrierRef.current = null;");
  });

  it("문서 전체 수화는 배리어를 남기지 않는다", () => {
    const restore = sourceBetween("async function restoreAutosave()", "function clearAutosaveDurableAuthority(");
    expect(restore).toContain("sidecarHistoryBarrierRef.current = null");
  });
});
