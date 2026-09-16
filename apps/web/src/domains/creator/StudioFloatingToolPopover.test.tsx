// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFloatingToolPopover } from "./studio-chrome-ui";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("StudioFloatingToolPopover portal contract", () => {
  it("keeps the open popover outside its toolbar owner and removes it when closed", () => {
    const view = render(
      <div data-toolbar-owner="true">
        <StudioFloatingToolPopover id="asset-group" open>
          <button type="button">에셋 적용</button>
        </StudioFloatingToolPopover>
      </div>
    );

    const owner = view.container.querySelector("[data-toolbar-owner]");
    const popover = document.body.querySelector(
      '[data-studio-tool-popover="asset-group"]'
    );

    expect(owner).not.toBeNull();
    expect(popover).not.toBeNull();
    expect(popover?.parentElement).toBe(document.body);
    expect(owner?.contains(popover)).toBe(false);
    expect(popover?.getAttribute("role")).toBe("dialog");
    expect(popover?.getAttribute("aria-modal")).toBe("false");
    expect(popover?.textContent).toContain("에셋 적용");

    view.rerender(
      <div data-toolbar-owner="true">
        <StudioFloatingToolPopover id="asset-group" open={false}>
          <button type="button">에셋 적용</button>
        </StudioFloatingToolPopover>
      </div>
    );

    expect(
      document.body.querySelector('[data-studio-tool-popover="asset-group"]')
    ).toBeNull();
  });

  it("uses movable and resizable desktop window chrome when requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const onClose = vi.fn();
    render(
      <StudioFloatingToolPopover
        id="ai-group"
        open
        desktopWindow={{
          label: "AI 도우미",
          surfaceId: "test-ai-assistant",
          defaultLayout: {
            version: 2,
            xRatio: 0.7,
            yRatio: 0.08,
            width: 440,
            height: 640,
            dock: "free",
            positionLocked: false,
            sizeLocked: false,
          },
          onClose,
        }}
      >        <button type="button">AI 실행</button>
      </StudioFloatingToolPopover>
    );

    const surface = document.body.querySelector(
      '[data-studio-workspace-tool-popover="true"]'
    );
    expect(surface?.getAttribute("data-studio-floating-surface")).toBe("true");
    expect(screen.getByRole("button", { name: "AI 도우미 이동" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 도우미 크기 조절" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 실행" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AI 도우미 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
