// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSiteHeaderHeight } from "./use-site-header-height";

function Header() {
  const ref = useRef<HTMLElement>(null);
  useSiteHeaderHeight(ref);
  return <header ref={ref}>Navigation</header>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--site-header-height");
});

describe("measured site header height", () => {
  it("can render on the server without measuring the DOM", () => {
    expect(renderToString(<Header />)).toContain("Navigation");
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("");
  });

  it("updates sticky consumers when the journey row changes height and cleans up on unmount", () => {
    let onResize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 114.5 } as DOMRect);
    const { unmount } = render(<Header />);
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("115px");
    expect(observe).toHaveBeenCalledWith(document.querySelector("header"));
    bounds.mockReturnValue({ height: 69 } as DOMRect);
    act(() => onResize?.([], {} as ResizeObserver));
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("69px");
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("");
  });

  it("falls back to window resize and restores an existing height when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    document.documentElement.style.setProperty("--site-header-height", "80px");
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 114 } as DOMRect);
    const { unmount } = render(<Header />);
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("114px");
    bounds.mockReturnValue({ height: 69 } as DOMRect);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("69px");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--site-header-height")).toBe("80px");
  });
});
