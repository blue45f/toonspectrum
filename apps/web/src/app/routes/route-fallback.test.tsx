// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteFallback } from "./route-fallback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("route loading fallback", () => {
  it("explains a delayed route without replacing the structural skeleton", async () => {
    vi.useFakeTimers();
    render(<RouteFallback />);
    expect(document.querySelector("[data-route-loading-fallback]")).not.toBeNull();
    expect(screen.queryByText("화면 구성 요소를 준비하고 있어요.")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4_600); });
    expect(screen.getByText("화면 구성 요소를 준비하고 있어요.")).toBeTruthy();
    expect(screen.getByRole("status", { name: /불러오는 중/u })).toBeTruthy();
  });
});
