// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPageIntro } from "./StudioPageIntro";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubMatchMedia(reduce: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
}

describe("StudioPageIntro", () => {
  it("prefers-reduced-motion이면 렌더링하지 않는다", () => {
    stubMatchMedia(true);
    const { container } = render(<StudioPageIntro motif="pen" />);
    expect(container.querySelector(".studio-page-intro")).toBeNull();
  });

  it("모티프 SVG를 그린다", () => {
    stubMatchMedia(false);
    const { container } = render(<StudioPageIntro motif="spark" />);
    const intro = container.querySelector(".studio-page-intro");
    expect(intro).not.toBeNull();
    expect(intro?.getAttribute("data-motif")).toBe("spark");
    expect(intro?.querySelector("svg")).not.toBeNull();
    // 장식용이므로 보조기기에서 숨긴다
    expect(intro?.getAttribute("aria-hidden")).toBe("true");
  });

  it("클릭하면 즉시 접힌다", () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    const { container } = render(<StudioPageIntro motif="cube" />);
    const intro = container.querySelector(".studio-page-intro");
    expect(intro).not.toBeNull();
    fireEvent.click(intro!);
    expect(intro?.classList.contains("studio-page-intro--collapsed")).toBe(true);
  });

  it("ESC를 누르면 즉시 접힌다", () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    const { container } = render(<StudioPageIntro motif="leaf" />);
    const intro = container.querySelector(".studio-page-intro");
    expect(intro).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(intro?.classList.contains("studio-page-intro--collapsed")).toBe(true);
  });

  it("약 1.3초 뒤 자동으로 접힌다", () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    const { container } = render(<StudioPageIntro motif="pose" />);
    const intro = container.querySelector(".studio-page-intro");
    expect(intro).not.toBeNull();
    expect(intro?.classList.contains("studio-page-intro--collapsed")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(intro?.classList.contains("studio-page-intro--collapsed")).toBe(true);
  });
});
