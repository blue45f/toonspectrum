// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketCompareShelf } from "./MarketCompareShelf";
import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketHomeSearch } from "./MarketHomeSearch";
import { MarketViewToggle } from "./MarketViewToggle";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";
import { useI18n } from "@/shared/lib/i18n";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="테스트 경로">{location.pathname}{location.search}</output>;
}
beforeEach(() => { localStorage.clear(); useI18n.getState().setLang("ko"); });
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("market experience controls", () => {
  it("encodes a home search and keeps it inside the market", () => {
    render(<MemoryRouter initialEntries={["/market"]}><MarketHomeSearch /><LocationProbe /></MemoryRouter>);
    fireEvent.change(screen.getByRole("searchbox", { name: "찾고 싶은 소재" }), { target: { value: "  한옥 & 잉크  " } });
    fireEvent.submit(screen.getByRole("search", { name: "소재 마켓 통합 검색" }));
    expect(screen.getByLabelText("테스트 경로").textContent).toBe(`/market/browse?${new URLSearchParams({ q: "한옥 & 잉크" })}`);
  });

  it("does not submit intermediate Korean composition", () => {
    render(<MemoryRouter initialEntries={["/market"]}><MarketHomeSearch /><LocationProbe /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "찾고 싶은 소재" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "잉" } });
    fireEvent.submit(screen.getByRole("search", { name: "소재 마켓 통합 검색" }));
    expect(screen.getByLabelText("테스트 경로").textContent).toBe("/market");
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: "잉크" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByLabelText("테스트 경로").textContent).toContain("/market/browse?");
  });

  it("provides authored English labels and a pressed state for layout controls", () => {
    useI18n.getState().setLang("en");
    const onChange = vi.fn();
    render(<MarketViewToggle value="grid" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("shows and removes actual comparison selections without granting ownership", () => {
    const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
    if (!record) throw new Error("Expected a starter material fixture");
    render(<MemoryRouter><MarketCompareToggle record={record} /><MarketCompareShelf /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "선택한 비교 후보" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `${record.name} 비교 목록에 추가` }));
    expect(screen.getByRole("region", { name: "선택한 비교 후보" }).textContent).toContain("1/4");
    expect(screen.getByRole("link", { name: "선택한 소재 비교하기" }).getAttribute("href")).toBe("/market/compare");
    fireEvent.click(screen.getByRole("button", { name: `비교 후보 ${record.name} 제외` }));
    expect(screen.queryByRole("region", { name: "선택한 비교 후보" })).toBeNull();
    expect(screen.getByRole("button", { name: `${record.name} 비교 목록에 추가` })).toBeTruthy();
  });

  it("reports invalid programmatic input instead of navigating silently", () => {
    render(<MemoryRouter initialEntries={["/market"]}><MarketHomeSearch /><LocationProbe /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "찾고 싶은 소재" });
    const maximum = Number(input.getAttribute("maxlength"));
    fireEvent.change(input, { target: { value: "a".repeat(maximum + 1) } });
    fireEvent.submit(screen.getByRole("search", { name: "소재 마켓 통합 검색" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("테스트 경로").textContent).toBe("/market");
  });
});
