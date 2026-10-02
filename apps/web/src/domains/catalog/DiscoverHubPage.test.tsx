// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import type { Title } from "@/shared/lib/types";

import { DiscoverHubPage } from "./DiscoverHubPage";
import { currentKstWeekDay, type DiscoverHomeSnapshot } from "./discover-home";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/components/title-card", () => ({
  TitleCard: ({ title }: { title: Title }) => <a href={`/title/${title.slug}`}>{title.title}</a>,
}));
vi.mock("@/shared/components/section", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/components/section")>()),
  Rail: ({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) => (
    <div role="list" aria-label={ariaLabel}>{children}</div>
  ),
}));

function title(id: string): Title {
  return {
    id,
    slug: id,
    type: "webtoon",
    title: `작품-${id}`,
    author: "작가",
    genres: ["판타지"],
    tags: [],
    synopsis: "",
    cover: ["#000000", "#111111"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2024,
    availability: [],
    stats: {
      views: 0,
      likes: 0,
      bookmarks: 0,
      ratingAvg: 4.5,
      ratingCount: 10,
      ratingDist: [0, 0, 0, 0, 10],
      rankDelta: 0,
      trendingScore: 0,
      completionRate: 0,
      bingeIndex: 0,
    },
  };
}

function snapshot(todayDay: string): DiscoverHomeSnapshot {
  return {
    topRated: [title("rated")],
    waitFree: [title("free")],
    newest: [title("new")],
    todayDay,
    todayReleases: [title("today")],
    genres: ["판타지"],
    stats: { titles: 60229, platforms: 20, genres: 18 },
    generatedAt: "2026-09-30T16:49:46.858Z",
  };
}

function mockResource(state: { data?: DiscoverHomeSnapshot | null; loading?: boolean; error?: string | null }) {
  resource.read.mockReturnValue({
    data: state.data ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: resource.reload,
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<DiscoverHubPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resource.read.mockReset();
  resource.reload.mockReset();
});
afterEach(cleanup);

describe("DiscoverHubPage", () => {
  it("reads the public catalog snapshot and shows real story shelves with their full-view links", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    expect(resource.read).toHaveBeenCalledWith("/data/home.json", expect.any(String));
    expect(screen.getByRole("heading", { level: 1, name: "다음 컷의 영감은, 새로운 이야기에서." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "평점 랭킹 상위 작품" })).getByRole("link", { name: "작품-rated" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /무료 작품 더 보기/ }).getAttribute("href")).toBe("/search?pricing=free,wait-free");
    expect(screen.getByText("60,229")).toBeTruthy();
    expect(screen.getByText(/2026-10-01 기준 공개 카탈로그/)).toBeTruthy();
  });

  it("features a spotlight story in the hero with a link to its detail page", () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), spotlight: { ...title("lead"), title: "스포트라이트 작품" }, featured: [title("f1")] } });
    renderPage();

    const spotlight = screen.getByRole("article", { name: "스포트라이트 작품" });
    expect(within(spotlight).getByRole("link", { name: "스포트라이트 작품" }).getAttribute("href")).toBe("/title/lead");
    expect(within(spotlight).getByRole("link", { name: /작품-f1/ }).getAttribute("href")).toBe("/title/f1");
    // 대표 작품 카드는 히어로 제목 뒤, 첫 레일보다 앞에 온다.
    const heading = screen.getByRole("heading", { level: 1 });
    const firstShelf = screen.getByRole("heading", { name: "오늘 업데이트되는 웹툰" });
    expect(heading.compareDocumentPosition(spotlight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spotlight.compareDocumentPosition(firstShelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not call a stale snapshot weekday 'today'", () => {
    const today = currentKstWeekDay();
    const otherDay = today === "월" ? "화" : "월";
    mockResource({ data: snapshot(otherDay) });
    renderPage();

    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
    expect(screen.getByRole("heading", { name: `${otherDay}요일 연재 인기작` })).toBeTruthy();
  });

  it("keeps search usable while picks load and sends the query to the search page", () => {
    mockResource({ loading: true });
    renderPage();

    expect(screen.getAllByRole("status", { name: "추천 작품을 불러오는 중" }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  나 혼자만 레벨업 " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("location").textContent).toBe(`/search?q=${encodeURIComponent("나 혼자만 레벨업")}`);
  });

  it("offers a retry when the snapshot fails and keeps the discovery tools reachable", () => {
    mockResource({ error: "추천 작품을 불러오지 못했습니다." });
    renderPage();

    expect(screen.getByRole("alert").textContent).toContain("추천 작품을 불러오지 못했어요");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button"));
    expect(resource.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /두 작품 비교/ }).getAttribute("href")).toBe("/compare");
    expect(screen.getByRole("link", { name: "#로맨스" }).getAttribute("href")).toBe(`/explore?genre=${encodeURIComponent("로맨스")}`);
  });

  it("continues from discovery into the community and the research desk, and folds the first-visit guide", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    // 작품을 찾은 뒤의 다음 행동: 이야기 나누기(커뮤니티)와 내 장면의 참고자료(리서치 데스크).
    expect(screen.getByRole("link", { name: /작품 이야기 나누기/ }).getAttribute("href")).toBe("/community");
    // 리서치 진입점은 머리말 행동과 도구 타일 두 곳이며 모두 같은 목적지로 이어진다.
    const researchLinks = screen.getAllByRole("link", { name: /참고자료 찾기/ });
    expect(researchLinks).toHaveLength(2);
    expect(researchLinks.every((link) => link.getAttribute("href") === "/research")).toBe(true);
    // 30초 안내는 처음에는 접혀 있다(모바일 길이 관리).
    const guide = screen.getByText("처음이라면 30초 안내").closest("details") as HTMLDetailsElement;
    expect(guide.open).toBe(false);
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
  });
});
