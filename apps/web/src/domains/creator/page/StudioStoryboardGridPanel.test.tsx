// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import type { StudioPageDnd } from "../studio-page-dnd";
import { StudioStoryboardGridPanel, type StoryboardGridPage } from "../StudioStoryboardGridPanel";
import { storyboardTeamReviewInUse } from "./studio-storyboard-team-review";

const idleDnd: StudioPageDnd = {
  dragIndex: null,
  dropSlot: null,
  itemProps: () => ({
    draggable: true,
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDrop: () => undefined,
    onDragEnd: () => undefined,
  }),
  indicatorFor: () => null,
};

function page(id: string, name: string): StoryboardGridPage {
  return { id, name, elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 };
}

function renderPanel(onAddPage = vi.fn(), pages: StoryboardGridPage[] = [page("page-1", "도입"), page("page-2", "전개")], onClose = vi.fn()) {
  render(
    <StudioStoryboardGridPanel
      open
      onClose={onClose}
      pages={pages}
      currentPageId="page-1"
      dnd={idleDnd}
      onSelectPage={vi.fn()}
      onAddPage={onAddPage}
      onDuplicatePage={vi.fn()}
      onDeletePage={vi.fn()}
      canDelete
    />,
  );
  return onAddPage;
}

afterEach(() => {
  cleanup();
});

/** 필터 드롭다운의 같은 문구(option)는 빼고, 페이지 카드에 보이는 글자만 센다. */
function cardTexts(text: string): HTMLElement[] {
  return screen.queryAllByText(text).filter((element) => element.tagName !== "OPTION");
}

describe("StudioStoryboardGridPanel sequence grid", () => {
  it("offers the next page right after the last card", () => {
    const onAddPage = renderPanel();
    const addTile = screen.getByRole("button", { name: "새 페이지 추가" });

    expect(addTile.getAttribute("data-studio-storyboard-add-page")).toBe("true");
    fireEvent.click(addTile);
    expect(onAddPage).toHaveBeenCalledTimes(1);
  });

  it("hides the in-grid add tile while a search filter hides pages", () => {
    renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "스토리보드 검색" }), { target: { value: "전개" } });

    expect(screen.queryByRole("button", { name: "새 페이지 추가" })).toBeNull();
    // 상단의 추가 버튼은 필터와 관계없이 남아 있다.
    expect(screen.getByRole("button", { name: "추가" })).toBeTruthy();
  });
});

describe("StudioStoryboardGridPanel solo summary", () => {
  it("detects team review only from real review activity", () => {
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false } }, {}])).toBe(false);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false, assignee: "  " } }])).toBe(false);
    expect(storyboardTeamReviewInUse([{ review: { status: "needs-review", locked: false } }])).toBe(true);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: true } }])).toBe(true);
    expect(storyboardTeamReviewInUse([{ review: { status: "draft", locked: false, assignee: "민지" } }])).toBe(true);
  });

  it("folds team metrics and blocker badges for a solo work until asked", () => {
    renderPanel();

    const summary = document.querySelector("[data-studio-storyboard-solo-summary]");
    expect(summary?.textContent).toMatch(/진행 요약 · 2페이지/u);
    // 1인 작업의 빈 페이지에 팀 검토 배지를 달아 오류처럼 보이게 하지 않는다.
    expect(cardTexts("담당자 미지정")).toHaveLength(0);
    expect(cardTexts("샷 정보 필요")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /제작 지표 모두 보기/u }));
    expect(document.querySelector("[data-studio-storyboard-solo-summary]")).toBeNull();
    expect(screen.getByRole("button", { name: /간단히 보기/u })).toBeTruthy();
  });

  it("keeps the full review board once the team uses review", () => {
    renderPanel(vi.fn(), [
      { ...page("page-1", "도입"), review: { status: "needs-review", locked: false, assignee: "민지" } },
      page("page-2", "전개"),
    ]);

    expect(document.querySelector("[data-studio-storyboard-solo-summary]")).toBeNull();
    expect(cardTexts("담당 민지")).toHaveLength(1);
    expect(cardTexts("담당자 미지정")).toHaveLength(1);
  });

  it("opens panel layouts and balloons on the current page from the top of the grid", () => {
    const onClose = vi.fn();
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    try {
      renderPanel(vi.fn(), undefined, onClose);
      fireEvent.click(screen.getByRole("button", { name: /컷 나누기/u }));
      fireEvent.click(screen.getByRole("button", { name: /말풍선 추가/u }));
    } finally {
      window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    }

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => (event as CustomEvent<{ mode: string }>).detail.mode))
      .toEqual(["assets", "story"]);
  });
});
