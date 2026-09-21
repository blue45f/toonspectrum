// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioMobileDockMetrics } from "./useStudioMobileDockMetrics";

function Harness({ enabled = true }: { enabled?: boolean }) {
  const dock = useRef<HTMLElement>(null); const sheet = useRef<HTMLDivElement>(null);
  useStudioMobileDockMetrics(enabled, dock, sheet);
  return <div data-studio-editor="true"><nav ref={dock} data-test-kind="dock" />
    <div ref={sheet} aria-hidden="false" data-test-kind="sheet"><div data-test-kind="header" data-studio-mobile-draw-header="true" /></div></div>;
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const height = this.dataset.testKind === "dock" ? 126 : this.dataset.testKind === "sheet" ? 264 : 84;
    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: 390, width: 390, height, toJSON: () => ({}) };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.style.removeProperty("--studio-mobile-dock-measured-height"); document.documentElement.style.removeProperty("--studio-mobile-active-draw-height"); });

describe("mobile dock geometry authority", () => {
  it("reserves the actual expanded height for both editor and portal siblings", () => {
    const view = render(<Harness />);
    const editor = view.container.querySelector<HTMLElement>('[data-studio-editor]')!;
    for (const owner of [editor, document.documentElement]) {
      expect(owner.style.getPropertyValue("--studio-mobile-dock-measured-height")).toBe("134px");
      expect(owner.style.getPropertyValue("--studio-mobile-active-draw-height")).toBe("264px");
    }
    expect(view.container.querySelector<HTMLElement>('[data-test-kind="sheet"]')!.style.getPropertyValue("--studio-mobile-draw-header-height")).toBe("84px");
  });
  it("restores prior owned values and leaves newer owners untouched", () => {
    document.documentElement.style.setProperty("--studio-mobile-dock-measured-height", "88px");
    const view = render(<Harness />);
    view.unmount();
    expect(document.documentElement.style.getPropertyValue("--studio-mobile-dock-measured-height")).toBe("88px");
    const second = render(<Harness />);
    document.documentElement.style.setProperty("--studio-mobile-dock-measured-height", "156px");
    second.unmount();
    expect(document.documentElement.style.getPropertyValue("--studio-mobile-dock-measured-height")).toBe("156px");
  });
  it("does not reserve mobile space when disabled", () => {
    render(<Harness enabled={false} />);
    expect(document.documentElement.style.getPropertyValue("--studio-mobile-dock-measured-height")).toBe("");
  });
});


it("remeasures expanded chrome and releases inactive sheet space after visibility changes", () => {
  let scheduleResize: (() => void) | undefined;
  let scheduleVisibility: (() => void) | undefined;
  let frame: FrameRequestCallback | undefined;
  const resizeDisconnect = vi.fn();
  const visibilityDisconnect = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { scheduleResize = callback; }
    observe() {} disconnect() { resizeDisconnect(); }
  });
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { scheduleVisibility = callback; }
    observe() {} disconnect() { visibilityDisconnect(); }
  });
  const view = render(<Harness />);
  const dock = view.container.querySelector<HTMLElement>('[data-test-kind="dock"]')!;
  const sheet = view.container.querySelector<HTMLElement>('[data-test-kind="sheet"]')!;
  Object.defineProperty(dock, "getBoundingClientRect", { configurable: true, value: () => ({ height: 198 } as DOMRect) });
  act(() => { scheduleResize?.(); frame?.(1); });
  expect(document.documentElement.style.getPropertyValue("--studio-mobile-dock-measured-height")).toBe("206px");
  sheet.setAttribute("aria-hidden", "true");
  act(() => { scheduleVisibility?.(); frame?.(2); });
  expect(document.documentElement.style.getPropertyValue("--studio-mobile-active-draw-height")).toBe("0px");
  sheet.removeAttribute("aria-hidden");
  act(() => { scheduleVisibility?.(); frame?.(3); });
  expect(document.documentElement.style.getPropertyValue("--studio-mobile-active-draw-height")).toBe("264px");
  view.unmount();
  expect(resizeDisconnect).toHaveBeenCalledOnce();
  expect(visibilityDisconnect).toHaveBeenCalledOnce();
});
