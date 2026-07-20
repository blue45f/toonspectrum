// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioPageListPane,
  type StudioPageListPaneHandlers,
  type StudioPageListPaneProps,
} from "./StudioPageListPane";

import type { PageState } from "./studio-page-state";

vi.mock("./studio-page-lazy-ui", () => ({
  StudioPageThumbnail: ({ page }: { page: PageState }) => (
    <div data-testid={`page-thumbnail-${page.id}`}>{page.id}</div>
  ),
}));

const PAGES: PageState[] = [
  {
    id: "page-1",
    name: "첫 장면",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 2_000,
  },
  {
    id: "page-2",
    name: "두 번째",
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 2_000,
  },
];

function createHandlers(): StudioPageListPaneHandlers {
  return {
    addPage: vi.fn(),
    applyBgToAll: vi.fn(),
    applyGradeToAll: vi.fn(),
    clearPageFor: vi.fn(),
    commitPageMeta: vi.fn(),
    deletePage: vi.fn(),
    duplicatePage: vi.fn(),
    duplicatePageMirrored: vi.fn(),
    insertPageAfter: vi.fn(),
    insertPageBefore: vi.fn(),
    movePageDown: vi.fn(),
    movePageToBottom: vi.fn(),
    movePageToTop: vi.fn(),
    movePageUp: vi.fn(),
  };
}

function createProps(
  overrides: Partial<StudioPageListPaneProps> = {},
): StudioPageListPaneProps {
  return {
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "협업 잠금",
    composeWorkAssetPreviewPage: (page) => page,
    currentPageId: "page-1",
    isMobile: false,
    leftResize: {
      width: 180,
      dragging: false,
      setWidth: vi.fn(),
      handleProps: {
        role: "separator",
        "aria-orientation": "vertical",
        "aria-valuenow": 180,
        "aria-valuetext": "180픽셀",
        "aria-valuemin": 128,
        "aria-valuemax": 360,
        tabIndex: 0,
        onPointerDown: vi.fn(),
        onKeyDown: vi.fn(),
        onDoubleClick: vi.fn(),
      },
    },
    master: { elements: [] },
    masterEditMode: false,
    masterPanelOpen: false,
    metaEditPageId: null,
    mobileKeyboardInset: 0,
    mobileSheet: null,
    pageDnd: {
      dragIndex: null,
      dropSlot: null,
      indicatorFor: () => null,
      itemProps: () => ({
        draggable: true,
        onDragStart: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
        onDragEnd: vi.fn(),
      }),
    },
    pages: PAGES,
    pagesSheetRef: { current: null },
    presentationPanelsHidden: false,
    setCurrentPageId: vi.fn(() => true),
    setLeftPanelOpen: vi.fn(),
    setMasterPanelOpen: vi.fn(),
    setMetaEditPageId: vi.fn(),
    setMobileSheet: vi.fn(),
    visibleLeftPanelOpen: true,
    stableHandlers: createHandlers(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioPageListPane", () => {
  it("keeps selection and page CRUD routed through the caller-owned contracts", () => {
    const props = createProps();
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<StudioPageListPane {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "두 번째 선택" }));
    expect(props.setCurrentPageId).toHaveBeenCalledWith("page-2");

    vi.mocked(props.setCurrentPageId).mockClear();
    const secondPage = within(screen.getAllByTestId("studio-page-item")[1]!);
    fireEvent.click(secondPage.getByRole("button", { name: "페이지 복제" }));
    fireEvent.click(secondPage.getByRole("button", { name: "미러 복제 (좌우 반전)" }));
    fireEvent.click(secondPage.getByRole("button", { name: "이 앞에 빈 페이지 삽입" }));
    fireEvent.click(secondPage.getByRole("button", { name: "이 뒤에 빈 페이지 삽입" }));
    fireEvent.click(secondPage.getByRole("button", { name: "이 페이지 내용 비우기" }));
    fireEvent.click(secondPage.getByRole("button", { name: "페이지 삭제" }));

    expect(props.stableHandlers.duplicatePage).toHaveBeenCalledWith("page-2");
    expect(props.stableHandlers.duplicatePageMirrored).toHaveBeenCalledWith("page-2");
    expect(props.stableHandlers.insertPageBefore).toHaveBeenCalledWith("page-2");
    expect(props.stableHandlers.insertPageAfter).toHaveBeenCalledWith("page-2");
    expect(props.stableHandlers.clearPageFor).toHaveBeenCalledWith("page-2");
    expect(confirm).toHaveBeenCalledWith("2페이지를 삭제할까요?");
    expect(props.stableHandlers.deletePage).toHaveBeenCalledWith("page-2");
    expect(props.setCurrentPageId).not.toHaveBeenCalled();
  });

  it("delegates ordered page moves and preserves the DnD card contract", () => {
    const onDragStart = vi.fn();
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const onDragEnd = vi.fn();
    const itemProps = vi.fn((_index: number) => ({
      draggable: true,
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd,
    }));
    const indicatorFor = vi.fn((index: number) => (index === 1 ? "before" as const : null));
    const props = createProps({
      pageDnd: {
        dragIndex: 1,
        dropSlot: 1,
        itemProps,
        indicatorFor,
      },
    });
    render(<StudioPageListPane {...props} />);

    expect(itemProps.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    expect(indicatorFor.mock.calls.map(([index]) => index)).toEqual([0, 1]);

    const [firstPage, secondPage] = screen.getAllByTestId("studio-page-item");
    expect(firstPage?.getAttribute("draggable")).toBe("true");
    expect(secondPage?.classList.contains("opacity-50")).toBe(true);
    expect(
      Array.from(secondPage!.querySelectorAll('span[aria-hidden="true"]')).some((node) =>
        node.className.includes("h-[3px]"),
      ),
    ).toBe(true);

    fireEvent.dragStart(firstPage!);
    fireEvent.dragOver(firstPage!);
    fireEvent.drop(firstPage!);
    fireEvent.dragEnd(firstPage!);
    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onDragOver).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDragEnd).toHaveBeenCalledOnce();

    fireEvent.click(within(firstPage!).getByRole("button", { name: "아래로 이동" }));
    fireEvent.click(within(firstPage!).getByRole("button", { name: "맨 아래로 이동" }));
    fireEvent.click(within(secondPage!).getByRole("button", { name: "위로 이동" }));
    fireEvent.click(within(secondPage!).getByRole("button", { name: "맨 위로 이동" }));

    expect(props.stableHandlers.movePageDown).toHaveBeenCalledWith("page-1");
    expect(props.stableHandlers.movePageToBottom).toHaveBeenCalledWith("page-1");
    expect(props.stableHandlers.movePageUp).toHaveBeenCalledWith("page-2");
    expect(props.stableHandlers.movePageToTop).toHaveBeenCalledWith("page-2");
    expect(within(firstPage!).getByRole<HTMLButtonElement>("button", { name: "위로 이동" }).disabled).toBe(true);
    expect(within(firstPage!).getByRole<HTMLButtonElement>("button", { name: "맨 위로 이동" }).disabled).toBe(true);
    expect(within(secondPage!).getByRole<HTMLButtonElement>("button", { name: "아래로 이동" }).disabled).toBe(true);
    expect(within(secondPage!).getByRole<HTMLButtonElement>("button", { name: "맨 아래로 이동" }).disabled).toBe(true);
  });

  it("preserves batch actions and inline page metadata commits", () => {
    const props = createProps({ metaEditPageId: "page-1" });
    render(<StudioPageListPane {...props} />);

    fireEvent.click(screen.getByTestId("studio-add-page"));
    fireEvent.click(screen.getByRole("button", { name: "그레이드 전체" }));
    fireEvent.click(screen.getByRole("button", { name: "배경 전체" }));
    expect(props.stableHandlers.addPage).toHaveBeenCalledOnce();
    expect(props.stableHandlers.applyGradeToAll).toHaveBeenCalledOnce();
    expect(props.stableHandlers.applyBgToAll).toHaveBeenCalledOnce();

    const name = screen.getByRole("textbox", { name: "페이지 이름" });
    fireEvent.change(name, { target: { value: "수정 이름" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(props.stableHandlers.commitPageMeta).toHaveBeenCalledWith("page-1", {
      name: "수정 이름",
    });
    expect(props.setMetaEditPageId).toHaveBeenCalledWith(null);

    const note = screen.getByRole("textbox", { name: "콘티 메모" });
    fireEvent.change(note, { target: { value: "카메라를 천천히 당긴다" } });
    fireEvent.blur(note);
    expect(props.stableHandlers.commitPageMeta).toHaveBeenCalledWith("page-1", {
      note: "카메라를 천천히 당긴다",
    });
  });

  it("keeps the mobile sheet inert while closed and restores modal semantics when opened", () => {
    const props = createProps({
      isMobile: true,
      mobileKeyboardInset: 24,
      mobileSheet: null,
    });
    const view = render(<StudioPageListPane {...props} />);
    let sheet = document.querySelector<HTMLElement>('[data-studio-sheet-id="pages"]');

    expect(sheet).not.toBeNull();
    expect(sheet?.hasAttribute("inert")).toBe(true);
    expect(sheet?.getAttribute("aria-modal")).toBeNull();
    expect(sheet?.style.bottom).toBe("24px");

    view.rerender(<StudioPageListPane {...props} mobileSheet="pages" />);
    sheet = document.querySelector<HTMLElement>('[data-studio-sheet-id="pages"]');
    expect(sheet?.hasAttribute("inert")).toBe(false);
    expect(sheet?.getAttribute("aria-modal")).toBe("true");
    expect(sheet?.getAttribute("data-popup-kind")).toBe("sheet");
    expect(sheet?.getAttribute("data-studio-sheet-snap")).toBe("medium");

    fireEvent.click(screen.getByRole("slider", { name: /페이지 시트 크기 조절/ }));
    expect(sheet?.getAttribute("data-studio-sheet-snap")).toBe("full");
  });

  it("uses arrow keys to resize one level, clamps at compact, and closes explicitly", () => {
    const props = createProps({
      isMobile: true,
      mobileSheet: "pages",
    });
    render(<StudioPageListPane {...props} />);
    const handle = screen.getByRole("slider", { name: /페이지 시트 크기 조절/ });
    const sheet = document.querySelector<HTMLElement>('[data-studio-sheet-id="pages"]');

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(sheet?.getAttribute("data-studio-sheet-snap")).toBe("compact");
    expect(props.setMobileSheet).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(handle, { key: "ArrowDown" })).toBe(false);
    expect(props.setMobileSheet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "페이지 시트 닫기" }));
    expect(props.setMobileSheet).toHaveBeenCalledWith(null);
  });
});
