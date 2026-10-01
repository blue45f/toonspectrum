// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarketComparePage } from "../pages/MarketComparePage";

import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketNavHeader } from "./MarketNavHeader";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("MarketNavHeader", () => {
  it("keeps comparison as a secondary selection tool and marks the exact destination current", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <MarketNavHeader />
        <Routes>
          <Route path="/market/browse" element={<p>탐색 결과</p>} />
          <Route path="/market/compare" element={<h1>비교 목록</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    const compare = screen.getByRole("link", { name: "후보 리소스 비교하기" });
    expect(compare.getAttribute("href")).toBe("/market/compare");
    expect(compare.getAttribute("aria-current")).toBeNull();
    fireEvent.click(compare);
    expect(screen.getByRole("heading", { name: "비교 목록" })).toBeTruthy();
    expect(compare.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "찾아보기" }).getAttribute("aria-current"))
      .toBeNull();
  });

  it("keeps production-fit as an optional selection tool instead of a permanent primary tab", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <MarketNavHeader />
        <Routes>
          <Route path="/market/browse" element={<p>탐색 결과</p>} />
          <Route path="/market/fit" element={<h1>제작 적합성 랩</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    const fit = screen.getByRole("link", { name: "제작 조건으로 맞는 리소스 찾기" });
    expect(fit.getAttribute("href")).toBe("/market/fit");
    fireEvent.click(fit);
    expect(screen.getByRole("heading", { name: "제작 적합성 랩" })).toBeTruthy();
    expect(fit.getAttribute("aria-current")).toBe("page");
  });

  it.each([
    ["/market/library", "내 에셋"],
    ["/market/wishlist", "찜 목록"],
    ["/market/manage", "배포하기"],
    ["/market/publish", "배포하기"],
  ])("marks the current top-level market place for %s", (route, label) => {
    render(<MemoryRouter initialEntries={[route]}><MarketNavHeader /></MemoryRouter>);
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current"))
      .toBe("page");
  });

  it("keeps the store navigation to four places that all stay visible on narrow screens", () => {
    render(<MemoryRouter initialEntries={["/market/browse"]}><MarketNavHeader /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "마켓 주요 내비게이션" });
    const places = ["찾아보기", "내 에셋", "찜 목록", "배포하기"].map((label) => screen.getByRole("link", { name: label }));
    // 네 장소는 좁은 화면에서 4열 격자로 모두 보인다(가로 스크롤 뒤로 숨지 않는다).
    const row = places[0]?.parentElement;
    expect(row?.className).toContain("grid-cols-4");
    expect(row?.className).not.toContain("overflow-x-auto");
    for (const place of places) expect(place.className).toContain("whitespace-nowrap");
    // 작업군 바로가기는 페이지 본문(공용 선택기)이 맡고 내비게이션에는 두지 않는다.
    expect(navigation.textContent).not.toContain("2D 에셋");
    expect(screen.queryByRole("link", { name: "상세 탐색" })).toBeNull();
    expect(screen.queryByRole("link", { name: "에셋 비교" })).toBeNull();
  });

  it("carries a real comparison selection through the secondary tool into the manifest table", () => {
    const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <Routes>
          <Route path="/market/browse" element={<><MarketNavHeader /><MarketCompareToggle record={record} /></>} />
          <Route path="/market/compare" element={<MarketComparePage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: `${record.name} 비교 목록에 추가` }));
    expect(screen.getByRole("button", { name: `${record.name} 비교 목록에서 제거` })
      .getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("link", { name: "후보 리소스 비교하기" }));
    expect(screen.getByRole("heading", { name: "에셋 비교" })).toBeTruthy();
    expect(screen.getByRole("table").textContent).toContain(record.name);
    expect(screen.getByRole("link", { name: "후보 리소스 비교하기" }).getAttribute("aria-current"))
      .toBe("page");
  });
});
