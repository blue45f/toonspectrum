// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyStudioColorPopover } from "./StudioLazyColorPopover";

const lazyUiMocks = vi.hoisted(() => ({
  preloadStudioColorPopover: vi.fn(),
}));

vi.mock("./studio-page-lazy-ui", () => ({
  preloadStudioColorPopover: lazyUiMocks.preloadStudioColorPopover,
  StudioColorPopoverContent: ({
    initialOpen,
    title,
  }: {
    initialOpen?: boolean;
    title?: string;
  }) => (
    <div data-testid="loaded-color-popover" data-initial-open={String(initialOpen)}>
      {title}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LazyStudioColorPopover", () => {
  it("preserves the accessible fallback trigger and warms the shared loader", () => {
    const onLoadRecentColors = vi.fn();
    render(
      <LazyStudioColorPopover
        value="#123456"
        onChange={vi.fn()}
        recentColors={[]}
        title="선 색상"
        className="custom-class"
        onLoadRecentColors={onLoadRecentColors}
      />
    );

    const trigger = screen.getByRole("button", { name: "선 색상" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.parentElement?.className).toContain("custom-class");

    fireEvent.mouseEnter(trigger);
    expect(lazyUiMocks.preloadStudioColorPopover).toHaveBeenCalledOnce();
    expect(onLoadRecentColors).toHaveBeenCalledOnce();
  });

  it("loads the real popover on activation with its initial-open contract", () => {
    const onLoadRecentColors = vi.fn();
    render(
      <LazyStudioColorPopover
        value="#abcdef"
        onChange={vi.fn()}
        recentColors={["#abcdef"]}
        onLoadRecentColors={onLoadRecentColors}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "색상 선택" }));

    expect(onLoadRecentColors).toHaveBeenCalledOnce();
    expect(screen.getByTestId("loaded-color-popover").dataset.initialOpen).toBe("true");
  });
});
