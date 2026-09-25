// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchExplorer } from "./search-explorer";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: Record<string, unknown>) => unknown) => selector({
    recentSearches: [],
    addRecentSearch: vi.fn(),
    removeRecentSearch: vi.fn(),
    clearRecentSearches: vi.fn(),
  }),
  useSavedTitleIds: () => new Set<string>(),
}));

vi.mock("@/platform/use-paginated-search", () => ({
  usePaginatedSearch: () => ({
    items: [],
    total: 0,
    data: { typeCount: { webtoon: 0, webnovel: 0 }, topTags: [], catalog: null },
    loading: false,
    loadingMore: false,
    failed: false,
    moreFailed: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}

afterEach(() => {
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("SearchExplorer", () => {
  it("uses a focus-contained mobile filter sheet and writes filters to the URL", async () => {
    const { container, unmount } = render(
      <MemoryRouter initialEntries={["/search?genres=%ED%8C%90%ED%83%80%EC%A7%80"]}>
        <SearchExplorer />
        <LocationProbe />
      </MemoryRouter>,
    );

    const openFilters = screen.getByRole("button", {
      name: /^search\.explorer\.filter\d*$/,
    });
    openFilters.focus();
    fireEvent.click(openFilters);

    const dialog = screen.getByRole("dialog", {
      name: "search.explorer.filter",
    });
    expect(dialog).not.toBeNull();
    // SiteShell isolates route content below its fixed mobile navigation. The sheet
    // must escape that stacking context so its bottom action receives real touches.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", {
      name: "search.explorer.type.webtoon",
    }));
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toContain("types=webtoon");
      expect(screen.getByLabelText("location").textContent).toContain("genres=");
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(openFilters);

    fireEvent.click(openFilters);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "결과 보기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(openFilters);

    fireEvent.click(openFilters);
    unmount();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
