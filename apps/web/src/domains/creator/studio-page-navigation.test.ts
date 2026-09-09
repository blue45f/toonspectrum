import { describe, expect, it } from "vitest";

import {
  filterStudioPageNavigationEntries,
  resolveStudioPageNavigationTarget,
  resolveStudioPageSelection,
  tokenizeStudioPageQuery,
} from "./studio-page-navigation";

import type { PageState } from "./studio-page-state";

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
    name: "표정 클로즈업",
    elements: [],
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
    id: "page-3",
    elements: [{ id: "shape-3" } as PageState["elements"][number]],
    bg: "#fff",
    bgGrad: null,
    canvasH: 2_000,
    review: { status: "approved", locked: false },
  },
];

describe("studio page navigation model", () => {
  it("normalizes and bounds a multi-token query", () => {
    expect(tokenizeStudioPageQuery("  옥상   검토 요청 옥상  ")).toEqual([
      "옥상",
      "검토",
      "요청",
    ]);
    expect(tokenizeStudioPageQuery("ＡＢＣ")).toEqual(["abc"]);
    expect(tokenizeStudioPageQuery(" ")).toEqual([]);
  });

  it("searches page names, numbers, notes, shot tags, review metadata, and assignees", () => {
    expect(filterStudioPageNavigationEntries(PAGES, "옥상 비", "all").map(({ page }) => page.id))
      .toEqual(["page-1"]);
    expect(filterStudioPageNavigationEntries(PAGES, "wide high", "all").map(({ page }) => page.id))
      .toEqual(["page-1"]);
    expect(filterStudioPageNavigationEntries(PAGES, "민지 검토", "all").map(({ page }) => page.id))
      .toEqual(["page-1"]);
    expect(filterStudioPageNavigationEntries(PAGES, "눈동자 수정", "all").map(({ page }) => page.id))
      .toEqual(["page-2"]);
    expect(filterStudioPageNavigationEntries(PAGES, "3페이지", "all").map(({ page }) => page.id))
      .toEqual(["page-3"]);
  });

  it("filters content, empty, notes, review queues, approvals, and locks", () => {
    expect(filterStudioPageNavigationEntries(PAGES, "", "content").map(({ page }) => page.id))
      .toEqual(["page-1", "page-3"]);
    expect(filterStudioPageNavigationEntries(PAGES, "", "empty").map(({ page }) => page.id))
      .toEqual(["page-2"]);
    expect(filterStudioPageNavigationEntries(PAGES, "", "notes").map(({ page }) => page.id))
      .toEqual(["page-1", "page-2"]);
    expect(filterStudioPageNavigationEntries(PAGES, "", "needs-review").map(({ page }) => page.id))
      .toEqual(["page-1", "page-2"]);
    expect(filterStudioPageNavigationEntries(PAGES, "", "approved").map(({ page }) => page.id))
      .toEqual(["page-3"]);
    expect(filterStudioPageNavigationEntries(PAGES, "", "locked").map(({ page }) => page.id))
      .toEqual(["page-2"]);
  });

  it("keeps selection in document order and supports toggle plus contiguous Shift ranges", () => {
    const orderedPageIds = PAGES.map((page) => page.id);
    const first = resolveStudioPageSelection({
      orderedPageIds,
      selectedPageIds: [],
      targetPageId: "page-1",
      anchorPageId: null,
      additive: false,
      range: false,
    });
    const toggled = resolveStudioPageSelection({
      orderedPageIds,
      selectedPageIds: first.selectedPageIds,
      targetPageId: "page-2",
      anchorPageId: first.anchorPageId,
      additive: true,
      range: false,
    });
    const ranged = resolveStudioPageSelection({
      orderedPageIds,
      selectedPageIds: toggled.selectedPageIds,
      targetPageId: "page-3",
      anchorPageId: toggled.anchorPageId,
      additive: false,
      range: true,
    });

    expect(toggled).toEqual({
      selectedPageIds: ["page-1", "page-2"],
      anchorPageId: "page-1",
    });
    expect(ranged).toEqual({
      selectedPageIds: ["page-1", "page-2", "page-3"],
      anchorPageId: "page-1",
    });

    expect(resolveStudioPageSelection({
      orderedPageIds,
      selectedPageIds: ["page-3", "missing", "page-1"],
      targetPageId: "page-2",
      anchorPageId: "page-1",
      additive: true,
      range: true,
    }).selectedPageIds).toEqual(["page-1", "page-2", "page-3"]);
  });

  it("resolves clamped keyboard navigation targets for short and long jumps", () => {
    const ids = Array.from({ length: 25 }, (_, index) => `page-${index + 1}`);
    expect(resolveStudioPageNavigationTarget(ids, "page-1", "ArrowUp")).toBe("page-1");
    expect(resolveStudioPageNavigationTarget(ids, "page-1", "ArrowDown")).toBe("page-2");
    expect(resolveStudioPageNavigationTarget(ids, "page-14", "PageUp")).toBe("page-4");
    expect(resolveStudioPageNavigationTarget(ids, "page-14", "PageDown")).toBe("page-24");
    expect(resolveStudioPageNavigationTarget(ids, "page-14", "Home")).toBe("page-1");
    expect(resolveStudioPageNavigationTarget(ids, "page-14", "End")).toBe("page-25");
    expect(resolveStudioPageNavigationTarget([], "missing", "End")).toBeNull();
  });
});
