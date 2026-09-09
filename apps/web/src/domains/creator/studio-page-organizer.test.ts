import { describe, expect, it } from "vitest";

import {
  STUDIO_PAGE_SEARCH_CHAR_LIMIT,
  STUDIO_PAGE_SEARCH_ELEMENT_LIMIT,
  buildStudioPageOrganizerEntries,
  filterStudioPageOrganizerEntries,
  normalizeStudioPageSearchQuery,
  resolveStudioPageKeyboardTarget,
  resolveStudioPageRangeSelection,
} from "./studio-page-organizer";

const PAGES = [
  {
    id: "page-1",
    name: "Opening",
    note: "비 오는 골목",
    shotType: "wide",
    elements: [{ type: "text", text: "안녕" }],
  },
  { id: "page-2", elements: [] },
  {
    id: "page-3",
    cameraAngle: "low-angle",
    elements: [{ type: "bubble", text: "결심했어" }],
  },
  {
    id: "page-4",
    review: { status: "changes-requested", assignee: "민지", note: "손 수정" },
    elements: [],
  },
] as const;

describe("studio page organizer", () => {
  it("normalizes compatibility characters and whitespace for predictable search", () => {
    expect(normalizeStudioPageSearchQuery("  ＰＡＧＥ   2  ")).toBe("page 2");
  });

  it("searches page aliases, metadata, review labels, and bounded element text", () => {
    const entries = buildStudioPageOrganizerEntries(PAGES);

    expect(filterStudioPageOrganizerEntries(entries, "비 골목", "all").map((entry) => entry.id))
      .toEqual(["page-1"]);
    expect(filterStudioPageOrganizerEntries(entries, "2페이지", "all").map((entry) => entry.id))
      .toEqual(["page-2"]);
    expect(filterStudioPageOrganizerEntries(entries, "결심", "content").map((entry) => entry.id))
      .toEqual(["page-3"]);
    expect(filterStudioPageOrganizerEntries(entries, "수정 요청 민지", "review").map((entry) => entry.id))
      .toEqual(["page-4"]);
  });

  it("filters empty, authored, annotated, and reviewed pages without mutating inputs", () => {
    const entries = buildStudioPageOrganizerEntries(PAGES);

    expect(filterStudioPageOrganizerEntries(entries, "", "content").map((entry) => entry.id))
      .toEqual(["page-1", "page-3"]);
    expect(filterStudioPageOrganizerEntries(entries, "", "empty").map((entry) => entry.id))
      .toEqual(["page-2", "page-4"]);
    expect(filterStudioPageOrganizerEntries(entries, "", "annotated").map((entry) => entry.id))
      .toEqual(["page-1", "page-3"]);
    expect(filterStudioPageOrganizerEntries(entries, "", "review").map((entry) => entry.id))
      .toEqual(["page-4"]);
    expect(PAGES.map((page) => page.id)).toEqual(["page-1", "page-2", "page-3", "page-4"]);
  });

  it("enforces search budgets for hostile or unusually large pages", () => {
    const oversized = {
      id: "large",
      elements: Array.from({ length: STUDIO_PAGE_SEARCH_ELEMENT_LIMIT + 100 }, (_, index) => ({
        type: "text",
        text: `${index}:`.padEnd(512, "x"),
      })),
    };
    const [entry] = buildStudioPageOrganizerEntries([oversized]);

    expect(entry).toBeDefined();
    expect(entry!.searchText.length).toBeLessThanOrEqual(STUDIO_PAGE_SEARCH_CHAR_LIMIT + 1_000);
    expect(entry!.searchText).not.toContain(`${STUDIO_PAGE_SEARCH_ELEMENT_LIMIT + 50}:`);
  });

  it("selects an actual Shift range and optionally unions Ctrl/Cmd+Shift ranges", () => {
    const ids = PAGES.map((page) => page.id);

    expect(resolveStudioPageRangeSelection(ids, "page-2", "page-4")).toEqual([
      "page-2",
      "page-3",
      "page-4",
    ]);
    expect(resolveStudioPageRangeSelection(ids, "page-2", "page-4", {
      additive: true,
      currentSelection: ["page-1"],
    })).toEqual(["page-1", "page-2", "page-3", "page-4"]);
    expect(resolveStudioPageRangeSelection(ids, "missing", "page-3")).toEqual(["page-1", "page-2", "page-3"]);
  });

  it("navigates visible pages with arrows, page jumps, Home, and End", () => {
    const ids = PAGES.map((page) => page.id);

    expect(resolveStudioPageKeyboardTarget(ids, "page-2", "ArrowDown")).toBe("page-3");
    expect(resolveStudioPageKeyboardTarget(ids, "page-2", "ArrowUp")).toBe("page-1");
    expect(resolveStudioPageKeyboardTarget(ids, "page-1", "PageDown", 2)).toBe("page-3");
    expect(resolveStudioPageKeyboardTarget(ids, "page-3", "Home")).toBe("page-1");
    expect(resolveStudioPageKeyboardTarget(ids, "page-2", "End")).toBe("page-4");
    expect(resolveStudioPageKeyboardTarget([], "page-1", "ArrowDown")).toBeNull();
  });
});
