// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFeedbackFeed } from "./use-feedback-feed";

import type { FeedbackFilters } from "./use-feedback-feed";
import type { FeedbackEntry, FeedbackPageResult } from "@toonstudio/core/feedback";

const mocks = vi.hoisted(() => ({ get: vi.fn(), error: vi.fn() }));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get },
  getApiErrorMessage: mocks.error,
}));

const filters: FeedbackFilters = {
  category: "all", progress: "all", query: "", mine: false, tag: "",
};
const entry: FeedbackEntry = {
  id: "post-1", category: "bug", title: "기존에 확인한 제보", text: "검증된 목록입니다.",
  tags: [], status: "open", progress: "received", metadata: {}, answeredAt: null,
  createdAt: "2026-09-27T00:00:00.000Z", author: { id: "member", name: "창작자", avatar: "" },
  replyCount: 0, voteCount: 0, viewerVoted: false,
};
const safeError = "일부 온라인 기능을 일시적으로 사용할 수 없습니다. 입력한 내용은 그대로 유지됩니다.";

function page(items = [entry]): FeedbackPageResult {
  return { contractVersion: 2, items, hasMore: false, nextCursor: null, canManage: false };
}

function deferredPage() {
  let resolve: (value: FeedbackPageResult) => void = () => { throw new Error("응답 준비 전 호출"); };
  let reject: (cause: unknown) => void = () => { throw new Error("오류 준비 전 호출"); };
  const promise = new Promise<FeedbackPageResult>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.error.mockResolvedValue(safeError);
});

describe("제보 목록 실패와 복구", () => {
  it("새로고침 중과 실패 후에는 기존 목록을 보존하고 검증된 복구 응답 전까지 쓰기를 막는다", async () => {
    const refresh = deferredPage();
    const recovery = deferredPage();
    const failure = new Error("화면에 직접 표시하면 안 되는 백엔드 오류");
    mocks.get.mockResolvedValueOnce(page()).mockReturnValueOnce(refresh.promise).mockReturnValueOnce(recovery.promise);
    const { result } = renderHook(() => useFeedbackFeed(filters, "member"));

    await waitFor(() => expect(result.current.apiReady).toBe(true));
    const verifiedRows = result.current.items;
    act(() => result.current.refresh());
    expect(result.current.loading).toBe(true);
    expect(result.current.apiReady).toBe(false);
    expect(result.current.items).toBe(verifiedRows);

    await act(async () => { refresh.reject(failure); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.error).toHaveBeenCalledWith(failure, "제보 목록을 불러오지 못했어요.");
    expect(result.current.error).toBe(safeError);
    expect(result.current.apiReady).toBe(false);
    expect(result.current.items).toBe(verifiedRows);

    act(() => result.current.refresh());
    expect(result.current.apiReady).toBe(false);
    expect(result.current.items).toBe(verifiedRows);
    await act(async () => { recovery.resolve(page()); });
    await waitFor(() => expect(result.current.apiReady).toBe(true));
    expect(result.current.error).toBe("");
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it("새 필터의 조회가 실패하면 이전 필터의 행을 표시하지 않고 같은 조건으로 복구한다", async () => {
    const filtered = deferredPage();
    const recoveredEntry = { ...entry, id: "post-2", title: "새 조건에 맞는 제보" };
    mocks.get.mockResolvedValueOnce(page()).mockReturnValueOnce(filtered.promise).mockResolvedValueOnce(page([recoveredEntry]));
    const { result, rerender } = renderHook(
      ({ currentFilters }) => useFeedbackFeed(currentFilters, "member"),
      { initialProps: { currentFilters: filters } },
    );
    await waitFor(() => expect(result.current.apiReady).toBe(true));

    rerender({ currentFilters: { ...filters, query: "새 조건" } });
    expect(result.current.items).toEqual([]);
    expect(result.current.apiReady).toBe(false);
    await act(async () => { filtered.reject(new Error("검색 실패")); });
    await waitFor(() => expect(result.current.error).toBe(safeError));
    expect(result.current.items).toEqual([]);
    expect(result.current.apiReady).toBe(false);

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.apiReady).toBe(true));
    expect(result.current.items).toEqual([recoveredEntry]);
    expect(result.current.error).toBe("");
    expect(mocks.get).toHaveBeenLastCalledWith("/feedback/posts", expect.objectContaining({
      params: expect.objectContaining({ q: "새 조건" }),
    }));
  });

  it("이전 계정의 늦은 응답은 새 계정 목록과 쓰기 준비 상태를 복구하지 못한다", async () => {
    const oldRequest = deferredPage();
    const newRequest = deferredPage();
    mocks.get.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const { result, rerender } = renderHook(
      ({ userId }) => useFeedbackFeed(filters, userId),
      { initialProps: { userId: "old-member" } },
    );
    rerender({ userId: "new-member" });
    await act(async () => { oldRequest.resolve({ ...page(), canManage: true }); });
    expect(result.current.items).toEqual([]);
    expect(result.current.apiReady).toBe(false);
    expect(result.current.canManage).toBe(false);

    await act(async () => { newRequest.reject(new Error("새 계정 조회 실패")); });
    await waitFor(() => expect(result.current.error).toBe(safeError));
    expect(result.current.items).toEqual([]);
    expect(result.current.apiReady).toBe(false);
    expect(result.current.canManage).toBe(false);
  });
});
