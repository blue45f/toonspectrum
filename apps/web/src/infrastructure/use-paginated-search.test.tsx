// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { usePaginatedSearch } from "./use-paginated-search";

import type { SearchResponse } from "./search-client";
import type { Title } from "@/shared/lib/types";

const request = vi.hoisted(() => vi.fn());
vi.mock("./search-client", () => ({ fetchSearchResponse: request, isSearchAbortError: (error: unknown) => error instanceof Error && error.name === "AbortError" }));
function page(number: number, total = 50, prefix = "id"): SearchResponse {
  const start = (number - 1) * 24;
  const items = Array.from({ length: Math.max(0, Math.min(24, total - start)) }, (_, i) => ({ id: `${prefix}-${start + i}` } as Title));
  return { items, total, typeCount: { webtoon: total, webnovel: 0 }, topTags: [],
    pagination: { page: number, pageSize: 24, total, hasMore: number * 24 < total, nextPage: number * 24 < total ? number + 1 : null } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  // Returning the mock registers it as a cleanup callback and calls it without a query.
  request.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("query-scoped paginated search", () => {
  it("loads one bounded page at a time and ignores simultaneous more clicks", async () => {
    request.mockImplementation(async (query: URLSearchParams) => page(Number(query.get("page"))));
    const { result } = renderHook(() => usePaginatedSearch("q=story", true, 0));
    await waitFor(() => expect(result.current.items).toHaveLength(24));
    expect(result.current.total).toBe(50);
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    expect(request).toHaveBeenCalledTimes(2);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(50));
    expect(result.current.hasMore).toBe(false);
    expect(new Set(result.current.items.map((item) => item.id)).size).toBe(50);
    expect(request.mock.calls.map(([query]) => query.get("page"))).toEqual(["1", "2", "3"]);
  });
  it("retains loaded cards on a page error and retries that same page", async () => {
    request.mockResolvedValueOnce(page(1)).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page(2));
    const { result } = renderHook(() => usePaginatedSearch("q=retry", true, 0));
    await waitFor(() => expect(result.current.items).toHaveLength(24));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.moreFailed).toBe(true));
    expect(result.current.items).toHaveLength(24);
    expect(result.current.failed).toBe(false);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(48));
    expect(request.mock.calls.map(([query]) => query.get("page"))).toEqual(["1", "2", "2"]);
  });
  it("does not append a late old-query page into the new query", async () => {
    const old = deferred<SearchResponse>();
    request.mockResolvedValueOnce(page(1, 50, "old")).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page(1, 1, "new"));
    const { result, rerender } = renderHook(({ query }) => usePaginatedSearch(query, true, 0), { initialProps: { query: "q=old" } });
    await waitFor(() => expect(result.current.items).toHaveLength(24));
    act(() => result.current.loadMore());
    rerender({ query: "q=new" });
    await waitFor(() => expect(result.current.items[0]?.id).toBe("new-0"));
    await act(async () => old.resolve(page(2, 50, "old")));
    expect(result.current.items.map((item) => item.id)).toEqual(["new-0"]);
    expect(request.mock.calls[1][1].aborted).toBe(true);
  });
  it("preserves empty saved filters and cancels on unmount", async () => {
    const pending = deferred<SearchResponse>(); request.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePaginatedSearch("ids=&sort=popular", true, 0));
    expect(request.mock.calls[0][0].has("ids")).toBe(true);
    expect(request.mock.calls[0][0].get("ids")).toBe("");
    unmount(); expect(request.mock.calls[0][1].aborted).toBe(true);
    await act(async () => pending.resolve(page(1, 0)));
  });
  it("rejects a non-advancing server cursor instead of looping", async () => {
    const invalid = page(1); invalid.pagination!.nextPage = 1;
    request.mockResolvedValue(invalid);
    const { result } = renderHook(() => usePaginatedSearch("q=invalid", true, 0));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.items).toHaveLength(0);
  });
  it("does not fetch while text is settling; refresh resets pagination", async () => {
    request.mockImplementation(async () => page(1));
    const { result, rerender } = renderHook(({ enabled, retry }) => usePaginatedSearch("q=ready", enabled, retry), { initialProps: { enabled: false, retry: 0 } });
    expect(request).not.toHaveBeenCalled();
    rerender({ enabled: true, retry: 0 });
    await waitFor(() => expect(result.current.items).toHaveLength(24));
    rerender({ enabled: true, retry: 1 });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0].get("page")).toBe("1");
  });
});
