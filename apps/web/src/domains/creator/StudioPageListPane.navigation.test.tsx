// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUiPreferencesRepository } from "./studio-ui-preferences-sqlite";
import {
  StudioPageListPane,
  type StudioPageListPaneHandlers,
  type StudioPageListPaneProps,
} from "./StudioPageListPane";

import type { PageState } from "./studio-page-state";

vi.mock("./studio-page-lazy-ui", () => ({
  StudioPageThumbnail: ({ page, className }: { page: PageState; className?: string }) => (
    <div data-testid={`page-thumbnail-${page.id}`} data-class-name={className}>{page.id}</div>
  ),
}));

const PAGES: PageState[] = [
  {
    id: "page-1",
    name: "옥상 대치",
    note: "비가 시작된다",
    shotType: "wide",
    cameraAngle: "high",
    elements: [{ id: "shape-1" } as PageState["elements"][number]],
    bg: "#fff",
    bgGrad: null,
    canvasH: 2_000,
    review: { status: "needs-review", locked: false, assignee: "민지" },
  },
  {
    id: "page-2",
    name: "빈 연결 컷",
    elements: [],
    bg: "#fff",
    bgGrad: null,
    canvasH: 2_000,
  },
  {
    id: "page-3",
    name: "표정 수정 컷",
    elements: [{ id: "shape-3" } as PageState["elements"][number]],
    bg: "#fff",
    bgGrad: null,
    canvasH: 2_000,
    review: {
      status: "changes-requested",
      locked: true,
      note: "눈동자 방향 수정",
    },
  },
  {
    id: "page-4",
    name: "승인 컷",
    elements: [{ id: "shape-4" } as PageState["elements"][number]],
    bg: "#fff",
    bgGrad: null,
    canvasH: 2_000,
    review: { status: "approved", locked: false },
  },
  {
    id: "page-5",
    name: "엔딩",
    elements: [{ id: "shape-5" } as PageState["elements"][number]],
    bg: "#fff",
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
    deletePagesBulk: vi.fn(),
    duplicatePage: vi.fn(),
    duplicatePageMirrored: vi.fn(),
    insertPageAfter: vi.fn(),
    insertPageBefore: vi.fn(),
    movePageDown: vi.fn(),
    movePagesBulk: vi.fn(),
    movePageToBottom: vi.fn(),
    movePageToTop: vi.fn(),
    movePageUp: vi.fn(),
  };
}

function createProps(
  overrides: Partial<StudioPageListPaneProps> = {},
): StudioPageListPaneProps {
  const values = new Map<string, string>();
  const preferences = createStudioUiPreferencesRepository({
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  });
  return {
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "협업 잠금",
    composeWorkAssetPreviewPage: (page) => page,
    currentPageId: "page-1",
    isMobile: false,
    leftResize: {
      width: 240,
      dragging: false,
      setWidth: vi.fn(),
      handleProps: {
        role: "separator",
        "aria-orientation": "vertical",
        "aria-valuenow": 240,
        "aria-valuetext": "240픽셀",
        "aria-valuemin": 128,
        "aria-valuemax": 720,
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
      itemProps: vi.fn(() => ({
        draggable: true,
        onDragStart: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
        onDragEnd: vi.fn(),
      })),
      indicatorFor: vi.fn(() => null),
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
    acquireUiPreferences: async () => preferences,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioPageListPane professional navigation", () => {
  it("searches page metadata and locks drag reorder while the result set is partial", async () => {
    const props = createProps();
    const itemProps = vi.mocked(props.pageDnd.itemProps);
    render(<StudioPageListPane {...props} />);
    expect(itemProps).toHaveBeenCalledTimes(PAGES.length);
    itemProps.mockClear();

    fireEvent.change(screen.getByRole("searchbox", { name: "페이지 검색" }), {
      target: { value: "민지 검토" },
    });

    await waitFor(() => expect(screen.getAllByTestId("studio-page-item")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "옥상 대치 선택" })).toBeTruthy();
    expect(screen.getByTestId("studio-page-item").getAttribute("draggable")).toBe("false");
    expect(itemProps).not.toHaveBeenCalled();
    expect(screen.getByText(/드래그 정렬을 잠급니다/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "페이지 검색어 지우기" }));
    fireEvent.change(screen.getByRole("combobox", { name: "페이지 필터" }), {
      target: { value: "locked" },
    });
    await waitFor(() => expect(screen.getAllByTestId("studio-page-item")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "표정 수정 컷 선택" })).toBeTruthy();
    expect(screen.getByLabelText("검토 잠금")).toBeTruthy();
  });

  it("uses Shift for a contiguous document-order range and keeps bulk actions ordered", () => {
    const props = createProps();
    render(<StudioPageListPane {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "옥상 대치 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "승인 컷 선택" }), { shiftKey: true });

    expect(screen.getByText("4개 선택")).toBeTruthy();
    expect(
      screen.getAllByTestId("studio-page-item").slice(0, 4)
        .every((item) => item.getAttribute("data-selected") === "true"),
    ).toBe(true);

    fireEvent.click(screen.getByTestId("studio-page-bulk-move-down"));
    expect(props.stableHandlers.movePagesBulk).toHaveBeenCalledWith(
      ["page-1", "page-2", "page-3", "page-4"],
      1,
    );
  });

  it("supports keyboard traversal, Shift extension, select-visible, and slash focus", async () => {
    const props = createProps();
    render(<StudioPageListPane {...props} />);
    const first = screen.getByRole("button", { name: "옥상 대치 선택" });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(props.setCurrentPageId).toHaveBeenLastCalledWith("page-2");

    fireEvent.keyDown(first, { key: "End", shiftKey: true });
    expect(props.setCurrentPageId).toHaveBeenLastCalledWith("page-5");
    expect(screen.getByText("4개 선택")).toBeTruthy();

    fireEvent.click(screen.getByTestId("studio-page-clear-selection"));
    fireEvent.change(screen.getByRole("combobox", { name: "페이지 필터" }), {
      target: { value: "needs-review" },
    });
    await waitFor(() => expect(screen.getAllByTestId("studio-page-item")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("studio-page-select-visible"));
    expect(screen.getByText("2개 선택")).toBeTruthy();

    const sheet = document.querySelector<HTMLElement>("[data-studio-sheet-id='pages']");
    expect(sheet).not.toBeNull();
    fireEvent.keyDown(sheet!, { key: "/" });
    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "페이지 검색" }),
    );
  });

  it("auto-follows the current page, can be paused, and restores a filtered current page", async () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const props = createProps();
      const view = render(<StudioPageListPane {...props} />);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      scrollIntoView.mockClear();

      view.rerender(<StudioPageListPane {...props} currentPageId="page-5" />);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      scrollIntoView.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "현재 페이지 자동 추적 끄기" }));
      view.rerender(<StudioPageListPane {...props} currentPageId="page-4" />);
      await Promise.resolve();
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.change(screen.getByRole("searchbox", { name: "페이지 검색" }), {
        target: { value: "옥상" },
      });
      await waitFor(() => expect(screen.getByTestId("studio-page-show-current")).toBeTruthy());
      fireEvent.click(screen.getByTestId("studio-page-show-current"));
      await waitFor(() => expect(screen.getAllByTestId("studio-page-item")).toHaveLength(PAGES.length));
      expect(
        screen.getByRole<HTMLInputElement>("searchbox", { name: "페이지 검색" }).value,
      ).toBe("");
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
      else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
