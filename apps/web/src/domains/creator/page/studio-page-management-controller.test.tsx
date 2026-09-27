// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { appendStudioPagesHistorySnapshot } from "../studio-pending-stroke-durability";
import { useStudioPageManagement } from "./studio-page-management-controller";

import type { PageState } from "../studio-page-state";

function createHarness() {
  const initialPage: PageState = {
    id: "page-1",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 2_000,
  };
  const pages = [initialPage];
  const pagesHistoryRef = { current: [pages] };
  const pagesHiRef = { current: 0 };
  const setCurrentPageId = vi.fn();
  const commitPages = vi.fn((nextPages: PageState[]) => {
    const appended = appendStudioPagesHistorySnapshot(
      pagesHistoryRef.current,
      pagesHiRef.current,
      nextPages,
    );
    pagesHistoryRef.current = appended.history;
    pagesHiRef.current = appended.historyIndex;
    return true;
  });
  const hook = renderHook(() => useStudioPageManagement({
    pages,
    pagesHistoryRef,
    pagesHiRef,
    activePage: initialPage,
    currentPageId: initialPage.id,
    setCurrentPageId,
    pendingStrokeCommitsRef: { current: null },
    flushPendingStrokeCommitsRef: { current: () => true },
    commitPages,
  }));
  return { ...hook, pages, pagesHistoryRef, pagesHiRef, setCurrentPageId, commitPages };
}

describe("페이지 추가 명령의 최신 히스토리 사용", () => {
  it("렌더 갱신 전 연속 추가해도 앞서 추가한 페이지와 두 히스토리 단계를 보존한다", () => {
    const harness = createHarness();
    const addPage = harness.result.current.addPage;

    act(() => {
      addPage();
      addPage();
    });

    const history = harness.pagesHistoryRef.current;
    const currentPages = history[harness.pagesHiRef.current];
    expect(currentPages).toHaveLength(3);
    expect(new Set(currentPages.map((page) => page.id)).size).toBe(3);
    expect(currentPages[0]).toBe(harness.pages[0]);
    expect(history.map((snapshot) => snapshot.length)).toEqual([1, 2, 3]);
    expect(currentPages[1]).toBe(history[1][1]);
    expect(currentPages.slice(1).map((page) => page.canvasH)).toEqual([2_000, 2_000]);
    expect(harness.setCurrentPageId.mock.calls).toEqual([
      [currentPages[1].id],
      [currentPages[2].id],
    ]);
  });

  it("실행 취소 뒤 추가하면 현재 히스토리에서 분기하고 redo 페이지를 되살리지 않는다", () => {
    const harness = createHarness();
    const retainedPage: PageState = { ...harness.pages[0], id: "retained-page" };
    const redoPage: PageState = { ...harness.pages[0], id: "redo-page" };
    harness.pagesHistoryRef.current = [
      harness.pages,
      [...harness.pages, retainedPage],
      [...harness.pages, retainedPage, redoPage],
    ];
    harness.pagesHiRef.current = 1;

    act(() => harness.result.current.addPage());

    const history = harness.pagesHistoryRef.current;
    expect(harness.pagesHiRef.current).toBe(2);
    expect(history).toHaveLength(3);
    expect(history[2]).toHaveLength(3);
    expect(history[2][1]).toBe(retainedPage);
    expect(history[2].some((page) => page.id === redoPage.id)).toBe(false);
  });

  it("커밋이 거부되면 페이지와 선택을 바꾸지 않는다", () => {
    const harness = createHarness();
    harness.commitPages.mockReturnValueOnce(false);

    act(() => harness.result.current.addPage());

    expect(harness.commitPages).toHaveBeenCalledOnce();
    expect(harness.pagesHistoryRef.current).toEqual([harness.pages]);
    expect(harness.pagesHiRef.current).toBe(0);
    expect(harness.setCurrentPageId).not.toHaveBeenCalled();
  });
});
