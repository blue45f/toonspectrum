// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketResources } from "../hooks/use-market-resources";

import { MarketHomePage } from "./MarketHomePage";

import type { MarketResourcesPage } from "../hooks/use-market-resources";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../components/MarketResourceCard", () => ({
  MarketResourceCard: ({ record }: { record: { id: string } }) => (
    <div data-testid={`resource-${record.id}`} />
  ),
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useResources = vi.mocked(useMarketResources);
const cachedRecord = {
  id: "cached-resource",
  tags: ["캐시", "복구", "마켓"],
} as CreatorMarketplaceResourceRecord;

function marketPage(overrides: Partial<MarketResourcesPage> = {}): MarketResourcesPage {
  return {
    items: [],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    stale: false,
    staleSavedAt: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarketHomePage", () => {
  it("스토어 내비게이션을 맨 위에 두고 표제·소재 찾기 뒤에 작업군 바로가기를 제공한다", () => {
    useResources.mockReturnValue(marketPage());
    render(<MemoryRouter initialEntries={["/market"]}><MarketHomePage /></MemoryRouter>);

    const heading = screen.getByRole("heading", { level: 1 });
    const browse = screen.getByRole("link", { name: "소재 찾기" });
    const navigation = screen.getByRole("navigation", { name: "마켓 주요 내비게이션" });
    const families = screen.getByRole("group", { name: "무엇을 찾고 있나요?" });
    // 스토어 내비게이션은 모든 마켓 화면에서 맨 위, 작업군 바로가기는 표제·검색 뒤에 둔다.
    expect(navigation.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(browse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(families) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(browse.getAttribute("href")).toBe("/market/browse");
    const menu = within(navigation);
    for (const label of ["찾아보기", "내 에셋", "찜 목록", "배포하기", "조건 맞춤", "후보 비교"]) {
      expect(menu.getByRole("link", { name: label })).toBeTruthy();
    }
    const familyLinks = within(families);
    for (const label of ["전체", "템플릿", "2D 에셋", "3D", "브러시", "색·보정"]) {
      expect(familyLinks.getByRole("link", { name: label })).toBeTruthy();
    }
    expect(familyLinks.getByRole("link", { name: "템플릿" }).getAttribute("href")).toBe("/market/browse?kind=template");
    expect(menu.getByRole("link", { name: "장면 레퍼런스" }).getAttribute("href")).toBe("/research/assets");
    expect(menu.getByRole("link", { name: "제작 강좌 ↗" }).getAttribute("href")).toBe("/learn");
  });

  it("announces recent-resource skeleton loading", () => {
    useResources.mockReturnValue(marketPage({ loading: true }));

    const { container } = render(
      <MemoryRouter>
        <MarketHomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("status").textContent).toContain("최근 공유된 마켓 리소스");
    expect(container.querySelector("ul[aria-busy='true']")).toBeTruthy();
    expect(container.querySelectorAll("li[aria-hidden='true']")).toHaveLength(8);
  });

  it("links the share CTA directly to the open Studio community share view", () => {
    useResources.mockReturnValue(marketPage());

    render(
      <MemoryRouter>
        <MarketHomePage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: "Studio에서 공유" }).getAttribute("href")
    ).toBe("/studio?assetMarket=community&communityView=share");
  });

  it("distinguishes every license text link without relying on color alone", () => {
    useResources.mockReturnValue(marketPage());

    render(
      <MemoryRouter>
        <MarketHomePage />
      </MemoryRouter>
    );

    const licenseLinks = screen.getAllByRole("link", { name: /사용권 전문 보기/ });
    expect(licenseLinks).toHaveLength(4);
    for (const link of licenseLinks) {
      expect(link.className.split(/\s+/u)).toContain("underline");
    }
  });

  it("keeps cached resource cards visible while clearly marking stale data", () => {
    const reload = vi.fn();
    useResources.mockReturnValue(marketPage({
      items: [cachedRecord],
      stale: true,
      staleSavedAt: "2026-08-30T07:00:00.000Z",
      reload,
    }));

    render(
      <MemoryRouter>
        <MarketHomePage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("resource-cached-resource")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("저장된 사본을 보여드리고 있어요");
    expect(screen.getByRole("status").textContent).toContain("현재 공개 상태는 확인되지 않았어요");
    const retry = screen.getByRole("button", { name: "다시 시도" });
    expect(retry.className).toContain("pointer-coarse:min-h-11");
    fireEvent.click(retry);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("shows the fatal recovery state only when no cached cards are available", () => {
    useResources.mockReturnValue(marketPage({ error: "offline" }));

    render(
      <MemoryRouter>
        <MarketHomePage />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("resource-cached-resource")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("최근 공유 리소스를 불러올 수 없어요");
  });
});


it("빈 공개 마켓에서 가입 없는 기본 소재로 이동할 수 있다", () => {
  useResources.mockReturnValue(marketPage());
  render(<MemoryRouter><MarketHomePage /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "기본 무료 소재 사용하기" }).getAttribute("href"))
    .toBe("/studio/assets?view=essentials");
});

it("사용권 안내는 접어 두되 네 가지 사용권 링크를 그대로 둔다", () => {
  useResources.mockReturnValue(marketPage());
  render(<MemoryRouter><MarketHomePage /></MemoryRouter>);
  const guide = screen.getByText("사용권 안내").closest("details") as HTMLDetailsElement;
  expect(guide.open).toBe(false);
  expect(within(guide).getAllByRole("link", { name: /사용권 전문 보기/ })).toHaveLength(4);
});

it("최근 공유는 휴대폰에서 처음 6개만 보이고 '더 보기'로 나머지를 펼친다", () => {
  const records = Array.from({ length: 8 }, (_, index) => ({ id: `r${index}`, tags: [`태그${index}`] }) as CreatorMarketplaceResourceRecord);
  useResources.mockReturnValue(marketPage({ items: records }));
  render(<MemoryRouter><MarketHomePage /></MemoryRouter>);
  const cards = () => records.map((record) => screen.getByTestId(`resource-${record.id}`).closest("li") as HTMLElement);
  expect(cards().map((card) => card.className.includes("max-sm:hidden"))).toEqual([false, false, false, false, false, false, true, true]);
  fireEvent.click(screen.getByRole("button", { name: "최근 공유 2개 더 보기" }));
  expect(cards().some((card) => card.className.includes("max-sm:hidden"))).toBe(false);
});

it("작업군은 모바일에서 옆으로 넘기는 한 줄로 묶이고 제작 순서를 유지한다", () => {
  useResources.mockReturnValue(marketPage());
  render(<MemoryRouter><MarketHomePage /></MemoryRouter>);
  const rail = screen.getByRole("list", { name: "리소스 작업군" });
  expect(rail.hasAttribute("data-site-rail")).toBe(true);
  const titles = within(rail).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
  expect(titles).toEqual(["템플릿", "2D 에셋", "3D", "브러시", "색·보정"]);
});

