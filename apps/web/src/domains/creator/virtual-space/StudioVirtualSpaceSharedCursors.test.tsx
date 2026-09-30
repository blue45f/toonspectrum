// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceSharedCursors } from "./StudioVirtualSpaceSharedCursors";

afterEach(() => {
  cleanup();
});

const cursors = [
  { sessionId: "peer:jun", displayName: "준 작가", color: "#f43f5e", x: 120, y: 240, hidden: false },
  { sessionId: "peer:mia", displayName: "미아", color: "#3b82f6", x: 400, y: 100, hidden: false },
  { sessionId: "peer:idle", displayName: "쉬는 중", color: "#22c55e", x: 10, y: 10, hidden: true },
];

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("StudioVirtualSpaceSharedCursors", () => {
  it("보이는 피어 커서를 이름표와 함께 렌더링한다", () => {
    stubMatchMedia(false);
    render(<StudioVirtualSpaceSharedCursors cursors={cursors} selfSessionId="self:kim" />);
    expect(screen.getByTestId("shared-cursor-peer:jun")).toBeTruthy();
    expect(screen.getByText("준 작가")).toBeTruthy();
    expect(screen.getByText("미아")).toBeTruthy();
    expect(screen.getByTestId("shared-cursor-peer:jun").getAttribute("data-cursor-color")).toBe("#f43f5e");
    vi.unstubAllGlobals();
  });

  it("idle(숨김) 커서와 내 커서는 렌더링하지 않는다", () => {
    stubMatchMedia(false);
    render(<StudioVirtualSpaceSharedCursors cursors={cursors} selfSessionId="peer:jun" />);
    expect(screen.queryByTestId("shared-cursor-peer:idle")).toBeNull();
    expect(screen.queryByTestId("shared-cursor-peer:jun")).toBeNull();
    expect(screen.queryByText("쉬는 중")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("오버레이는 포인터 이벤트를 가로채지 않고 스크린 리더에서 숨겨진다", () => {
    stubMatchMedia(false);
    render(<StudioVirtualSpaceSharedCursors cursors={cursors} />);
    const overlay = screen.getByTestId("shared-cursors-overlay");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.className).toContain("pointer-events-none");
    vi.unstubAllGlobals();
  });

  it("reduced-motion에서는 목표 좌표에 바로 렌더링한다", () => {
    stubMatchMedia(true);
    render(<StudioVirtualSpaceSharedCursors cursors={cursors} />);
    const cursor = screen.getByTestId("shared-cursor-peer:mia");
    expect(cursor.getAttribute("style")).toContain("translate(400px, 100px)");
    expect(cursor.className).toContain("motion-reduce:transition-none");
    vi.unstubAllGlobals();
  });

  it("스크린 리더용 요약 텍스트를 제공한다", () => {
    stubMatchMedia(false);
    const { container } = render(<StudioVirtualSpaceSharedCursors cursors={cursors} />);
    const summary = container.querySelector(".sr-only");
    expect(summary?.textContent).toContain("준 작가");
    vi.unstubAllGlobals();
  });
});
