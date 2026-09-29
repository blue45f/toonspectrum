// @vitest-environment jsdom
/**
 * Reduced-motion coverage for the spotlight tour lives in its own file on purpose:
 * motion v12 caches the reduced-motion preference per module registry on the first
 * mount, so a matchMedia stub flipped mid-file would be ignored by later mounts.
 * Vitest isolates files, which makes this file's `true` stub deterministic.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorkspaceSpotlightTour } from "./StudioWorkspaceSpotlightTour";

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
  stubMatchMedia(true);
  stubTargetRects();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("studio workspace spotlight tour under reduced motion", () => {
  it("snaps the spotlight instantly instead of springing", async () => {
    renderTour();
    await screen.findByRole("dialog", { name: "스포트라이트 투어" });
    await waitFor(() => expect(ring()).not.toBeNull());

    const first = ring();
    expect(first?.style.top).toBe("90px");
    expect(first?.style.left).toBe("40px");

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    // No spring to wait for: the ring must already sit on the next target.
    await waitFor(() => expect(ring()?.style.top).toBe("290px"));
    expect(ring()?.style.left).toBe("40px");
    expect(ring()?.style.width).toBe("220px");
    expect(ring()?.style.height).toBe("140px");
  });

  it("removes the spotlight without an exit animation", async () => {
    renderTour();
    await screen.findByRole("dialog", { name: "스포트라이트 투어" });
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "스포트라이트 투어" })).toBeNull());
    expect(ring()).toBeNull();
  });
});
