// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HiringPublicPositions } from "./HiringPositionsPage";
import { emptyTerms } from "./hiring-form-values";

import type { HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

import { api } from "@/infrastructure/api";

vi.mock("@/infrastructure/api", () => ({ api: { get: vi.fn() }, getApiErrorMessage: async () => "연결 실패" }));
vi.mock("./HiringSlotEditor", () => ({ HiringTermsView: () => <div>모집 조건</div> }));
const get = vi.mocked(api.get);
function page(title: string, next: string | null = null): HiringPositionPage {
  return { items: [{ id: title, postId: "post", postTitle: title, revision: 1, terms: emptyTerms() }], next };
}
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(postId?: string) { return render(<MemoryRouter><HiringPublicPositions postId={postId} /></MemoryRouter>); }
beforeEach(() => { get.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("public hiring search recovery and request identity", () => {
  it.each([{}, { items: null, next: null }, { items: [{ id: "broken" }], next: null }, { ...page("bad terms"), items: [{ ...page("bad terms").items[0], terms: { model: "invalid" } }] }])("contains malformed API data in the optional section instead of breaking its host", async (invalid) => {
    get.mockResolvedValueOnce(invalid).mockResolvedValueOnce({ items: [], next: null });
    render(<MemoryRouter><h1>원래 공고</h1><HiringPublicPositions postId="post-a" /></MemoryRouter>);
    await screen.findByText("연결 실패");
    expect(screen.getByRole("heading", { name: "원래 공고" })).toBeTruthy();
    expect(screen.queryByText("이 조건에 맞는 공개 모집 자리가 없어요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await screen.findByText("이 조건에 맞는 공개 모집 자리가 없어요.");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("retries only after an explicit gesture, preserving the filters", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page("복구된 공고"));
    mount();
    await screen.findByText("연결 실패");
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    await screen.findByRole("heading", { name: "복구된 공고" });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1]?.params).toEqual(get.mock.calls[0][1]?.params);
    expect(get.mock.calls[1][1]).toMatchObject({ timeout: 10000, retry: 0 });
  });
  it("supports forward/back cursor navigation and never invents a total", async () => {
    get.mockResolvedValueOnce(page("첫 공고", "cursor-1")).mockResolvedValueOnce(page("다음 공고", "cursor-2")).mockResolvedValueOnce(page("첫 공고", "cursor-1"));
    mount(); await screen.findByText("1페이지 · 이 페이지 1개 · 한 번에 최대 30개");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await screen.findByText("2페이지 · 이 페이지 1개 · 한 번에 최대 30개");
    expect(get.mock.calls[1][1]?.params).toEqual({ after: "cursor-1" });
    fireEvent.click(screen.getByRole("button", { name: "이전 페이지" }));
    await screen.findByText("1페이지 · 이 페이지 1개 · 한 번에 최대 30개");
    expect(get.mock.calls[2][1]?.params).toEqual({});
  });
  it("resets all conditions and returns to the first page", async () => {
    get.mockResolvedValue(page("공개 공고", "next")); mount();
    await screen.findByRole("heading", { name: "공개 공고" });
    fireEvent.change(screen.getByRole("combobox", { name: "역할" }), { target: { value: "lineart" } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await screen.findByRole("heading", { name: "공개 공고" });
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await screen.findByText("2페이지 · 이 페이지 1개 · 한 번에 최대 30개");
    fireEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
    await screen.findByText("1페이지 · 이 페이지 1개 · 한 번에 최대 30개");
    expect(get.mock.calls.at(-1)?.[1]?.params).toEqual({});
    expect((screen.getByRole("combobox", { name: "역할" }) as HTMLSelectElement).value).toBe("");
  });
  it("ignores late responses after filter changes even if transport ignores abort", async () => {
    const old = pending<HiringPositionPage>();
    get.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("선화 모집")); mount();
    fireEvent.change(screen.getByRole("combobox", { name: "역할" }), { target: { value: "lineart" } });
    await screen.findByRole("heading", { name: "선화 모집" });
    expect(get.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => old.resolve(page("오래된 공고")));
    expect(screen.queryByRole("heading", { name: "오래된 공고" })).toBeNull();
    expect(screen.getByRole("heading", { name: "선화 모집" })).toBeTruthy();
  });
  it("does not skip a page while loading and retains recovery after a page error", async () => {
    const next = pending<HiringPositionPage>();
    get.mockResolvedValueOnce(page("첫 공고", "next")).mockReturnValueOnce(next.promise).mockResolvedValue(page("첫 공고", "next"));
    mount(); await screen.findByRole("heading", { name: "첫 공고" });
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect((screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => next.reject(new Error("offline")));
    await screen.findByText("연결 실패");
    fireEvent.click(screen.getByRole("button", { name: "처음으로" }));
    await screen.findByText("1페이지 · 이 페이지 1개 · 한 번에 최대 30개");
  });
  it("paginates embedded post slots and resets on a different post", async () => {
    get.mockResolvedValueOnce(page("A 자리", "after-a")).mockResolvedValueOnce(page("A 다음 자리")).mockResolvedValueOnce(page("B 자리"));
    const view = mount("post-a"); await screen.findByRole("heading", { name: "A 자리" });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await screen.findByRole("heading", { name: "A 다음 자리" });
    expect(get.mock.calls[1][1]?.params).toEqual({ postId: "post-a", after: "after-a" });
    view.rerender(<MemoryRouter><HiringPublicPositions postId="post-b" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "B 자리" });
    expect(get.mock.calls[2][1]?.params).toEqual({ postId: "post-b" });
    expect(screen.getByText("1페이지 · 이 페이지 1개 · 한 번에 최대 30개")).toBeTruthy();
  });
  it("does not follow a cursor that points back to an already visited page", async () => {
    get.mockResolvedValueOnce(page("첫 공고", "same")).mockResolvedValueOnce(page("다음 공고", "same"));
    mount(); await screen.findByRole("heading", { name: "첫 공고" });
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await screen.findByRole("heading", { name: "다음 공고" });
    expect((screen.getByRole("button", { name: "다음 페이지" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
