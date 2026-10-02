// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMobileShowMore, useShowMore } from "./site-show-more";

describe("useShowMore", () => {
  it("shows the first N, grows by the step, and starts over when the reset key changes", () => {
    const { result, rerender } = renderHook(({ key }) => useShowMore(20, 6, key), { initialProps: { key: "all" } });
    expect(result.current.visible).toBe(6);
    expect(result.current.remaining).toBe(14);

    act(() => result.current.showMore());
    expect(result.current.visible).toBe(12);
    act(() => result.current.showMore(10));
    expect(result.current.visible).toBe(20);
    expect(result.current.remaining).toBe(0);

    // 필터가 바뀌면 이전에 늘린 개수가 남지 않는다.
    rerender({ key: "free" });
    expect(result.current.visible).toBe(6);
  });

  it("never reports more visible items than exist", () => {
    const { result } = renderHook(() => useShowMore(3, 6));
    expect(result.current.visible).toBe(3);
    expect(result.current.remaining).toBe(0);
  });
});

describe("useMobileShowMore", () => {
  it("hides only the items beyond the first N on phones until expanded", () => {
    const { result } = renderHook(() => useMobileShowMore(6, 3));
    expect([0, 1, 2, 3, 5].map((index) => result.current.hiddenOnMobile(index))).toEqual([false, false, false, true, true]);
    expect(result.current.remaining).toBe(3);

    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
    expect(result.current.hiddenOnMobile(5)).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("collapses again when the search or filter key changes", () => {
    const { result, rerender } = renderHook(({ key }) => useMobileShowMore(6, 3, key), { initialProps: { key: "" } });
    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
    rerender({ key: "브러시" });
    expect(result.current.expanded).toBe(false);
    expect(result.current.hiddenOnMobile(4)).toBe(true);
  });

  it("has nothing to reveal when the list already fits", () => {
    const { result } = renderHook(() => useMobileShowMore(2, 3));
    expect(result.current.remaining).toBe(0);
    expect(result.current.hiddenOnMobile(1)).toBe(false);
  });
});
