// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorkspaceSpotlightTour } from "./StudioWorkspaceSpotlightTour";
import { WORKSPACE_TOUR_STORAGE_KEY } from "./studio-workspace-tour-state";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));

const TARGET_RECTS: Record<string, { top: number; left: number; width: number; height: number }> = {
  continue: { top: 100, left: 50, width: 200, height: 60 },
  "quick-actions": { top: 300, left: 50, width: 200, height: 120 },
  tools: { top: 600, left: 900, width: 48, height: 48 },
};

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reducedMotion && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function stubTargetRects() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const key = this.getAttribute("data-tour-target") ?? "";
    const box = TARGET_RECTS[key];
    if (!box) {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    }
    return {
      x: box.left, y: box.top, top: box.top, left: box.left,
      right: box.left + box.width, bottom: box.top + box.height,
      width: box.width, height: box.height, toJSON: () => ({}),
    } as DOMRect;
  });
}

function renderTour() {
  render(
    <>
      <div data-tour-target="continue" />
      <div data-tour-target="quick-actions" />
      <div data-tour-target="tools" />
      <StudioWorkspaceSpotlightTour ready />
    </>,
  );
}

function ring(): HTMLElement | null {
  return document.querySelector(".workspace-tour-ring");
}

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia(false);
  stubTargetRects();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("studio workspace spotlight tour", () => {
  it("walks a first-time visitor through 이어하기 → 빠른 작업 → 도구 메뉴", async () => {
    renderTour();
    const dialog = await screen.findByRole("dialog", { name: "스포트라이트 투어" });
    expect(dialog.textContent).toContain("작업을 이어가세요");
    expect(dialog.textContent).toContain("1 / 3");

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() => expect(dialog.textContent).toContain("빠른 작업으로 원고를 관리하세요"));
    expect(dialog.textContent).toContain("2 / 3");

    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    await waitFor(() => expect(dialog.textContent).toContain("작업을 이어가세요"));

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() => expect(dialog.textContent).toContain("도구는 여기서 꺼내세요"));
    expect(screen.getByRole("button", { name: "투어 마치기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "투어 마치기" }));
    await waitFor(() => expect(window.localStorage.getItem(WORKSPACE_TOUR_STORAGE_KEY)).toBe("done"));
  });

  it("skips immediately and remembers the choice", async () => {
    renderTour();
    await screen.findByRole("dialog", { name: "스포트라이트 투어" });
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    await waitFor(() => expect(window.localStorage.getItem(WORKSPACE_TOUR_STORAGE_KEY)).toBe("done"));
  });

  it("stays hidden for returning visitors and while not ready", async () => {
    window.localStorage.setItem(WORKSPACE_TOUR_STORAGE_KEY, "done");
    render(
      <>
        <div data-tour-target="continue" />
        <StudioWorkspaceSpotlightTour ready={false} />
      </>,
    );
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
    expect(screen.queryByRole("dialog", { name: "스포트라이트 투어" })).toBeNull();
    expect(ring()).toBeNull();
  });

  it("closes with the Escape key", async () => {
    renderTour();
    const dialog = await screen.findByRole("dialog", { name: "스포트라이트 투어" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(window.localStorage.getItem(WORKSPACE_TOUR_STORAGE_KEY)).toBe("done"));
  });
});
