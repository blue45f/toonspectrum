// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { RouteFallback } from "./route-fallback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("route loading fallback", () => {
  it("explains a delayed route without replacing the structural skeleton", async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <RouteFallback accessibleTitle="정밀 CAD" />
      </MemoryRouter>,
    );
    expect(document.querySelector("[data-route-loading-fallback]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "정밀 CAD" })).toBeTruthy();
    expect(screen.getByText("웹툰 컷에 사용할 3D 배경·소품·카메라 구도를 직접 만듭니다.")).toBeTruthy();
    expect(screen.queryByText("이 작업에 필요한 상태를 준비하고 있어요.")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4_600); });
    expect(screen.getByText("이 작업에 필요한 상태를 준비하고 있어요.")).toBeTruthy();
    expect(screen.getByText("작성 중인 초안과 복구 상태를 확인하고 있습니다.")).toBeTruthy();
    expect(screen.getByRole("status", { name: /불러오는 중/u })).toBeTruthy();
  });
});
