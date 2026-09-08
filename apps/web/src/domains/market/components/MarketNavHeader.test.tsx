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
  it("opens the comparison route from the public navigation and marks it current", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <MarketNavHeader />
        <Routes>
          <Route path="/market/browse" element={<p>탐색 결과</p>} />
          <Route path="/market/compare" element={<h1>비교 목록</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    const compare = screen.getByRole("link", { name: "에셋 비교" });
    expect(compare.getAttribute("href")).toBe("/market/compare");
    expect(compare.getAttribute("aria-current")).toBeNull();
    fireEvent.click(compare);
    expect(screen.getByRole("heading", { name: "비교 목록" })).toBeTruthy();
    expect(compare.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "탐색" }).getAttribute("aria-current"))
      .toBeNull();
  });

  it.each([
    ["/market/resource/example", "탐색"],
    ["/market/publish", "판매자 센터"],
  ])("preserves the current navigation for %s", (route, label) => {
    render(<MemoryRouter initialEntries={[route]}><MarketNavHeader /></MemoryRouter>);
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("link", { name: "에셋 비교" }).getAttribute("aria-current"))
      .toBeNull();
  });

  it("carries a real comparison selection through the navigation into the manifest table", () => {
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
    fireEvent.click(screen.getByRole("link", { name: "에셋 비교" }));
    expect(screen.getByRole("heading", { name: "에셋 비교" })).toBeTruthy();
    expect(screen.getByRole("table").textContent).toContain(record.name);
    expect(screen.getByRole("link", { name: "에셋 비교" }).getAttribute("aria-current"))
      .toBe("page");
  });
});
