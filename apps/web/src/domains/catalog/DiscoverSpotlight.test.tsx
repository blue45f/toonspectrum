// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { DiscoverSpotlight } from "./DiscoverSpotlight";
import type { DiscoverHomeSnapshot } from "./discover-home";

vi.mock("@/shared/components/cover-image", () => ({
  CoverImage: ({ fallback }: { readonly fallback?: ReactNode }) => <>{fallback}</>,
}));

afterEach(cleanup);

function title(id: string, overrides: Partial<Title> = {}): Title {
  return {
    id,
    slug: `slug-${id}`,
    type: "webtoon",
    title: `작품 ${id}`,
    author: "작가",
    genres: ["로맨스", "드라마"],
    tags: [],
    synopsis: "줄거리",
    cover: ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"],
    status: "completed",
    ageRating: "all",
    releaseYear: 2024,
    availability: [],
    stats: {
      views: 0,
      likes: 0,
      bookmarks: 0,
      ratingAvg: 4.62,
      ratingCount: 10,
      ratingDist: [0, 0, 0, 0, 10],
      rankDelta: 0,
      trendingScore: 0,
      completionRate: 0,
      bingeIndex: 0,
    },
    ...overrides,
  };
}

function snapshot(overrides: Partial<DiscoverHomeSnapshot> = {}): DiscoverHomeSnapshot {
  return {
    spotlight: title("lead", { coverImage: "https://example.com/cover.jpg" }),
    featured: [title("f1"), title("f2"), title("f3")],
    topRated: [title("r1")],
    waitFree: [],
    newest: [],
    todayDay: "월",
    todayReleases: [],
    genres: [],
    stats: { titles: 1, platforms: 1, genres: 1 },
    generatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function renderSpotlight(props: { snapshot: DiscoverHomeSnapshot | null; loading: boolean }) {
  return render(
    <MemoryRouter>
      <DiscoverSpotlight {...props} />
    </MemoryRouter>,
  );
}

describe("DiscoverSpotlight", () => {
  it("shows the lead story with its meta, rating and two more picks", () => {
    renderSpotlight({ snapshot: snapshot(), loading: false });
    const card = screen.getByRole("article", { name: "작품 lead" });
    expect(within(card).getByRole("link", { name: "작품 lead" }).getAttribute("href")).toBe("/title/slug-lead");
    expect(card.textContent).toContain("작가 · 로맨스·드라마 · 완결");
    expect(card.textContent).toContain("4.6");
    const more = within(card).getAllByRole("link").filter((link) => link.getAttribute("href") !== "/title/slug-lead");
    expect(more.map((link) => link.getAttribute("href"))).toEqual(["/title/slug-f1", "/title/slug-f2"]);
  });

  it("falls back to theme-token artwork instead of the story's warm cover colors", () => {
    const { container } = renderSpotlight({ snapshot: snapshot(), loading: false });
    const html = container.innerHTML;
    expect(html).toContain("var(--color-accent)");
    expect(html).not.toContain("oklch(0.45 0.14 35)");
  });

  it("shows a skeleton while loading and nothing when there is no pick", () => {
    const { rerender } = renderSpotlight({ snapshot: null, loading: true });
    expect(screen.getByRole("status", { name: "대표 작품을 불러오는 중" }).getAttribute("aria-busy")).toBe("true");
    rerender(
      <MemoryRouter>
        <DiscoverSpotlight snapshot={null} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });
});
