// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewsPage } from "./NewsPage";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));

type Category = "industry" | "adaptation" | "event" | "novel" | "title";

function newsItems(): { title: string; source: string; url: string; date: string; category: Category; related?: { slug: string; title: string }[] }[] {
  const plan: readonly [Category, number][] = [["industry", 10], ["event", 6], ["novel", 4]];
  return plan.flatMap(([category, count]) => Array.from({ length: count }, (_, index) => ({
    title: `${category} 소식 ${index + 1}`,
    source: "toon.example",
    url: `https://news.example/${category}/${index + 1}`,
    date: "2026-09-30T00:00:00.000Z",
    category,
    related: index === 0 ? [{ slug: `${category}-work`, title: `${category} 작품` }] : undefined,
  })));
}

function mockResource(state: { data?: unknown; loading?: boolean; error?: string | null }) {
  resource.read.mockReturnValue({
    data: state.data ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: resource.reload,
  });
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/news"]}><NewsPage /></MemoryRouter>);
}

const listItems = () => within(screen.getByRole("list", { name: "소식 목록" })).getAllByRole("listitem");

beforeEach(() => {
  resource.read.mockReset();
  resource.reload.mockReset();
  mockResource({ data: { items: newsItems(), generatedAt: "2026-10-01T08:15:59.853Z" } });
});

afterEach(() => cleanup());

describe("뉴스 페이지", () => {
  it("처음에는 8건만 보여 주고 '더 보기'로 8건씩 늘린다", () => {
    renderPage();
    expect(listItems()).toHaveLength(8);
    expect(screen.getByRole("status").textContent).toContain("소식 20건 중 8건 표시");

    fireEvent.click(screen.getByRole("button", { name: "소식 더 보기 · 12건 남음" }));
    expect(listItems()).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "소식 더 보기 · 4건 남음" }));
    expect(listItems()).toHaveLength(20);
    expect(screen.queryByRole("button", { name: /소식 더 보기/u })).toBeNull();
  });

  it("카테고리 칩은 개수를 보여 주고, 고르면 목록이 처음 8건부터 다시 시작한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "소식 더 보기 · 12건 남음" }));
    expect(listItems()).toHaveLength(16);

    const filter = screen.getByRole("group", { name: "소식 카테고리" });
    expect(within(filter).getByRole("button", { name: /전체/u }).textContent).toContain("20");
    const event = within(filter).getByRole("button", { name: /공모전·행사/u });
    expect(event.textContent).toContain("6");
    fireEvent.click(event);

    expect(event.getAttribute("aria-pressed")).toBe("true");
    expect(listItems()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /소식 더 보기/u })).toBeNull();
  });

  it("키워드 검색은 제목·매체·관련 작품에서 찾고, 결과가 없으면 초기화 행동을 준다", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox", { name: "뉴스 키워드 검색" }), { target: { value: "novel 작품" } });
    expect(listItems()).toHaveLength(1);

    fireEvent.change(screen.getByRole("searchbox", { name: "뉴스 키워드 검색" }), { target: { value: "없는 검색어" } });
    expect(screen.getByText("조건에 맞는 소식이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(listItems()).toHaveLength(8);
  });

  it("각 소식은 새 창 원문 링크이고, 관련 작품 칩은 작품 상세로 이어진다", () => {
    renderPage();
    const first = listItems().slice(0, 1)[0] ?? document.body;
    const article = within(first).getAllByRole("link").slice(0, 1)[0] ?? first;
    expect(article.getAttribute("href")).toBe("https://news.example/industry/1");
    expect(article.getAttribute("target")).toBe("_blank");
    expect(article.getAttribute("rel")).toContain("noopener");
    expect(within(first).getByRole("link", { name: /industry 작품/u }).getAttribute("href")).toBe("/title/industry-work");
  });

  it("끝은 막다른 길이 아니라 작품 탐색·작가 기회센터·커뮤니티로 이어지고, 공모전 소식에서는 기회센터가 먼저다", () => {
    renderPage();
    const next = () => within(screen.getByRole("heading", { name: "소식을 읽은 다음엔" }).closest("section")!).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(next()).toEqual(["/discover", "/opportunities", "/community"]);

    fireEvent.click(within(screen.getByRole("group", { name: "소식 카테고리" })).getByRole("button", { name: /공모전·행사/u }));
    expect(next()).toEqual(["/opportunities", "/discover", "/community"]);
  });

  it("불러오지 못하면 오류와 다시 시도를 보여 주고, 불러오는 동안에는 필터를 숨긴다", () => {
    mockResource({ error: "연결 실패" });
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("뉴스를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: /재시도/u }));
    expect(resource.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "소식 카테고리" })).toBeNull();
  });
});
