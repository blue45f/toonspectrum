import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = studioPageSource.indexOf(start);
  const endIndex = studioPageSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return studioPageSource.slice(startIndex, endIndex);
}

describe("pending stroke lifecycle source contract", () => {
  it("서버 저장 잠금 전에 대기 획을 flush하고 같은 savePages로 이미지와 doc을 만든다", () => {
    const handleSave = sourceBetween(
      "async function handleSave(status:",
      "// 터치 기기(작은 폰)에서는"
    );
    const flushIndex = handleSave.indexOf("flushPendingStrokeCommitsRef.current()");
    const lockIndex = handleSave.indexOf("documentSaveInFlightRef.current = true");

    expect(flushIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(flushIndex);
    expect(handleSave).toContain("const savePages = saveHistory[saveHistoryIndex] ?? pages");
    expect(handleSave).toContain("for (const page of savePages)");
    expect(handleSave).toContain("pagesList: savePages");
    expect(handleSave).not.toContain("for (const page of pages)");
  });

  it("같은 task의 연속 commit은 render closure 대신 ref history를 전진시킨다", () => {
    const commit = sourceBetween("function commit(\n", "// 같은 key의 연속 동작이면");

    expect(commit).toContain("const currentHistory = pagesHistoryRef.current");
    expect(commit).toContain("const commitBasePages = currentHistory[currentHistoryIndex] ?? pages");
    expect(commit).toContain("appendStudioPagesHistorySnapshot(");
    expect(commit.indexOf("pagesHistoryRef.current = appended.history")).toBeLessThan(
      commit.indexOf("setPagesHistory(appended.history)")
    );
    expect(commit.indexOf("pagesHiRef.current = appended.historyIndex")).toBeLessThan(
      commit.indexOf("setPagesHi(appended.historyIndex)")
    );
  });

  it("route/page lifecycle은 안정 상태와 대기 획을 모두 동기 복구 슬롯에 기록한다", () => {
    const persistence = sourceBetween(
      "persistPendingStrokeEmergencyAutosaveRef.current = (reason) =>",
      "function applyStudioProjectSnapshotWithPreparedDocuments"
    );

    expect(persistence).toContain("hasDirtyStableState");
    expect(persistence).toContain("hasDirtyPendingState");
    expect(persistence).toContain("createStudioLifecycleEmergencyAutosave");
    expect(persistence).toContain("writeStudioLifecycleAutosave");
    expect(persistence).toContain(
      "!autosaveChecked || hasAutosave || autosaveRestoreBlockedReason !== null"
    );
  });

  it("복구 탐지 전 primary를 보존하고 교차 페이지 입력은 성공한 flush 뒤에만 허용한다", () => {
    const pageSelection = sourceBetween(
      "function setCurrentPageId(next:",
      "// ── 문서 마스터"
    );
    const drawingStart = sourceBetween(
      "if (tool === \"draw\")",
      "// A CRDT stroke has its own conflict-free operation stream"
    );
    const flushPipeline = sourceBetween(
      "flushPendingStrokeCommitsRef.current = () =>",
      "discardPendingStrokeCommitsRef.current = () =>"
    );
    const pageCommit = sourceBetween(
      "function commitPages(\n",
      "function patchPageReview"
    );

    expect(pageSelection).toContain("pendingBatch.pageId !== nextPageId");
    expect(pageSelection).toContain("!flushPendingStrokeCommitsRef.current()");
    expect(pageSelection).toContain("drawingRef.current || requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()");
    expect(studioPageSource).toContain("if (!setCurrentPageId(pageId)) return;");
    expect(drawingStart).toContain("pendingBatch.pageId !== activePage.id");
    expect(drawingStart).toContain("!flushPendingStrokeCommitsRef.current()");
    expect(flushPipeline).toContain("return false");
    expect(flushPipeline).toContain("return true");
    expect(pageCommit).toContain("pendingBatch && !flushPendingStrokeCommitsRef.current()");
    expect(pageCommit).toContain("options.pendingStrokePolicy !== \"drop\"");
    expect(pageCommit).toContain("projectStudioPendingStrokes(nextPages");
    expect(pageCommit).toContain("const currentHistory = pagesHistoryRef.current");
    expect(pageCommit).toContain("drawingRef.current || requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()");
  });

  it("복구와 프로젝트 교체는 활성·대기 획을 문서 경계 너머로 운반하지 않는다", () => {
    const restore = sourceBetween("async function restoreAutosave()", "function clearAutosave()");
    const replacement = sourceBetween(
      "function applyStudioProjectSnapshotWithPreparedDocuments",
      "async function applyStudioProjectSnapshot("
    );

    expect(restore.indexOf("prepareStudioDocumentReplacement")).toBeLessThan(
      restore.indexOf("captureStudioMutationTicket")
    );
    expect(restore).toContain("requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()");
    expect(restore).toContain("pendingStrokeCommitsRef.current");
    expect(restore).toContain("pagesHistoryRef.current = [restoredPages]");
    expect(replacement).toContain('prepareStudioDocumentReplacement("프로젝트를 교체")');
    expect(replacement).toContain("const currentHistory = pagesHistoryRef.current");
    expect(replacement).toContain("appendStudioPagesHistorySnapshot(");
    expect(replacement.indexOf("pagesHistoryRef.current = appended.history")).toBeLessThan(
      replacement.indexOf("setPagesHistory(appended.history)")
    );
  });
});
