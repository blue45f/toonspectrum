// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessibleTooltipLayer } from "./AccessibleTooltipLayer";

function rect({
  left = 100,
  top = 100,
  width = 32,
  height = 32,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

function installBrowserStubs(reducedMotion = false): void {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reducedMotion,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-app-tooltip-layer="true"]')) {
      return rect({ left: 0, top: 0, width: 200, height: 64 });
    }
    if (this.matches('[data-zero-size-anchor="true"]')) {
      return rect({ width: 0, height: 0 });
    }
    return rect();
  });
}

function renderLayer(children: ReactNode) {
  return render(
    <>
      <AccessibleTooltipLayer />
      {children}
    </>,
  );
}

function revealByHover(target: HTMLElement): HTMLElement {
  fireEvent.pointerOver(target, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(360));
  return screen.getByRole("tooltip");
}

beforeEach(() => {
  document.documentElement.lang = "ko";
  installBrowserStubs();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("AccessibleTooltipLayer", () => {
  it("adds friendly state and shortcut guidance to an icon-only accessible control", () => {
    vi.useFakeTimers();
    renderLayer(
      <button type="button" aria-label="작업 메뉴" aria-expanded="false" aria-keyshortcuts="Alt+M">
        <svg aria-hidden="true" />
      </button>,
    );

    const button = screen.getByRole("button", { name: "작업 메뉴" });
    const tooltip = revealByHover(button);

    expect(tooltip.textContent).toContain("작업 메뉴");
    expect(tooltip.textContent).toContain("누르면 관련 메뉴나 패널을 엽니다.");
    expect(tooltip.textContent).toContain("Alt+M");
    expect(tooltip.getAttribute("data-positioned")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toContain(tooltip.id);
  });

  it("avoids noisy aria-label duplication when a control already has visible text", () => {
    vi.useFakeTimers();
    renderLayer(
      <button type="button" aria-label="저장">
        저장
      </button>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "저장" }), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(600));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("suppresses the native title, stays readable under the pointer, and restores it", () => {
    vi.useFakeTimers();
    renderLayer(<button type="button" title="원본 다운로드" />);
    const button = screen.getByRole("button", { name: "원본 다운로드" });
    const tooltip = revealByHover(button);

    expect(button.hasAttribute("title")).toBe(false);

    fireEvent.pointerOut(button, {
      pointerType: "mouse",
      relatedTarget: tooltip,
    });
    fireEvent.pointerOver(tooltip, {
      pointerType: "mouse",
      relatedTarget: button,
    });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBe(tooltip);

    fireEvent.pointerOut(tooltip, {
      pointerType: "mouse",
      relatedTarget: document.body,
    });
    act(() => vi.advanceTimersByTime(221));

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("title")).toBe("원본 다운로드");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("falls back to rendered child geometry when an inline wrapper reports zero size", () => {
    vi.useFakeTimers();
    renderLayer(
      <span title="레이어 옵션" data-zero-size-anchor="true">
        <span aria-hidden="true" />
      </span>,
    );
    const wrapper = screen.getByTitle("레이어 옵션");
    const child = wrapper.firstElementChild as HTMLElement;

    const tooltip = revealByHover(child);

    expect(tooltip.textContent).toContain("레이어 옵션");
    expect(tooltip.getAttribute("data-positioned")).toBe("true");
  });

  it("opens immediately for keyboard focus and Escape dismisses it", () => {
    renderLayer(
      <button type="button" aria-label="검색 열기">
        <svg aria-hidden="true" />
      </button>,
    );
    const button = screen.getByRole("button", { name: "검색 열기" });

    fireEvent.focusIn(button);
    expect(screen.getByRole("tooltip").textContent).toContain("검색 열기");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("uses long-press as help-only input and cancels when touch turns into a drag", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    renderLayer(
      <>
        <button type="button" aria-label="삭제" onClick={onClick}>
          <svg aria-hidden="true" />
        </button>
        <button type="button" aria-label="공유">
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    const deleteButton = screen.getByRole("button", { name: "삭제" });

    fireEvent.pointerDown(deleteButton, {
      pointerType: "touch",
      pointerId: 7,
      clientX: 20,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(520));
    expect(screen.getByRole("tooltip").textContent).toContain("삭제");

    fireEvent.pointerUp(deleteButton, {
      pointerType: "touch",
      pointerId: 7,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.click(deleteButton);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.pointerDown(document.body, { pointerType: "touch", pointerId: 8 });
    expect(screen.queryByRole("tooltip")).toBeNull();

    const shareButton = screen.getByRole("button", { name: "공유" });
    fireEvent.pointerDown(shareButton, {
      pointerType: "touch",
      pointerId: 9,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(shareButton, {
      pointerType: "touch",
      pointerId: 9,
      clientX: 40,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not duplicate Studio-owned hints or override a user's off preference", () => {
    vi.useFakeTimers();
    renderLayer(
      <>
        <span data-studio-tool-hint-target="true">
          <button type="button" aria-label="스튜디오 도구">
            <svg aria-hidden="true" />
          </button>
        </span>
        <div data-studio-tool-hint-mode="off">
          <button type="button" title="숨긴 도움말" />
        </div>
      </>,
    );

    for (const button of screen.getAllByRole("button")) {
      fireEvent.pointerOver(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole("tooltip")).toBeNull();
    }
  });
});
