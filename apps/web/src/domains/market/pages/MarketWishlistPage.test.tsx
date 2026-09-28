// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketWishlistPage } from "./MarketWishlistPage";
import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

vi.mock("../hooks/use-market-resource-detail", () => ({ useMarketResourceDetail: vi.fn() }));
vi.mock("../components/MarketResourceCard", () => ({ MarketResourceCard: ({ record }: { record: { name: string } }) => <h2>{record.name}</h2> }));
const detail = vi.mocked(useMarketResourceDetail);
const key = "toonspectrum:market:wishlist";
const reload = vi.fn();
const absent = { record: null, loading: false, notFound: true, error: null, staleSavedAt: null, reload };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); detail.mockReturnValue(absent); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function mount(ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids));
  return render(<MemoryRouter initialEntries={["/market/wishlist"]}><MarketWishlistPage /></MemoryRouter>);
}

describe("서버 소재 찜 목록", () => {
  it("내장 목록에 없는 ID도 서버 상세 결과로 표시한다", () => {
    const source = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
    if (!source) throw new Error("소재 fixture가 필요합니다");
    detail.mockReturnValue({ ...absent, notFound: false, record: { ...source, id: "server-only", name: "서버에 게시된 소재" } });
    mount(["server-only"]);
    expect(detail).toHaveBeenCalledWith("server-only");
    expect(screen.getByRole("heading", { name: "서버에 게시된 소재" })).toBeTruthy();
    expect(screen.queryByText("찜한 에셋이 아직 없어요")).toBeNull();
  });
  it("비공개 항목을 조용히 숨기지 않고 사용자가 직접 제거할 수 있다", () => {
    mount(["unavailable"]);
    expect(screen.getByRole("heading", { name: "현재 공개되지 않은 소재입니다" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(reload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "찜 목록에서 제거" }));
    expect(screen.getByRole("heading", { name: "찜한 에셋이 아직 없어요" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual([]);
  });
  it("저장 실패 시 삭제가 성공한 것처럼 표시하지 않는다", () => {
    mount(["unavailable"]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.click(screen.getByRole("button", { name: "찜 목록에서 제거" }));
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요");
    expect(screen.getByRole("heading", { name: "현재 공개되지 않은 소재입니다" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(["unavailable"]);
  });
  it("열두 개씩 확인하여 긴 찜 목록의 요청량을 제한한다", () => {
    mount(Array.from({ length: 15 }, (_, index) => `remote-${index}`));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(detail).not.toHaveBeenCalledWith("remote-12");
    fireEvent.click(screen.getByRole("button", { name: "찜한 소재 더 보기" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    expect(detail).toHaveBeenCalledWith("remote-14");
    expect(screen.queryByRole("button", { name: "찜한 소재 더 보기" })).toBeNull();
  });
});

it("로딩과 조회 오류를 빈 찜 목록으로 처리하지 않는다", () => {
  detail.mockReturnValue({ ...absent, loading: true, notFound: false });
  const view = mount(["remote-loading"]);
  expect(screen.getByText("찜한 소재 정보를 확인하는 중")).toBeTruthy();
  expect(screen.queryByText("찜한 에셋이 아직 없어요")).toBeNull();
  detail.mockReturnValue({ ...absent, notFound: false, error: "private diagnostic" });
  view.rerender(<MemoryRouter><MarketWishlistPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "찜한 소재를 불러오지 못했어요" })).toBeTruthy();
  expect(screen.queryByText("private diagnostic")).toBeNull();
  expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(["remote-loading"]);
});

it("캐시로 복구한 소재는 현재 공개 상태 미확인임을 알린다", () => {
  const source = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
  if (!source) throw new Error("소재 fixture가 필요합니다");
  detail.mockReturnValue({ ...absent, record: source, notFound: false, staleSavedAt: "2026-09-28T00:00:00Z" });
  mount([source.id]);
  expect(screen.getByText(/현재 공개 상태는 확인되지 않았어요/u)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
  expect(reload).toHaveBeenCalledOnce();
});
