// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioToolHintBubble } from "./components/StudioToolHintBubble";
import {
  STUDIO_TOOL_HINT_WARM_SWITCH_DELAY_MS,
  StudioToolHintPreferencesProvider,
  StudioToolHintTarget,
} from "./StudioToolHint";

function renderPair() {
  return render(
    <StudioToolHintPreferencesProvider mode="compact" touchHoldDelayMs={480} reduceMotion>
      <StudioToolHintTarget
        hint={{ id: "optimized-pen", title: "펜", description: "선을 그립니다." }}
      >
        <button type="button">펜</button>
      </StudioToolHintTarget>
      <StudioToolHintTarget
        hint={{ id: "optimized-eraser", title: "지우개", description: "선을 지웁니다." }}
      >
        <button type="button">지우개</button>
      </StudioToolHintTarget>
    </StudioToolHintPreferencesProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StudioToolHint optimized interaction", () => {
  it("switches quickly inside an already-intentional tooltip lane", () => {
    vi.useFakeTimers();
    renderPair();
    const pen = screen.getByRole("button", { name: "펜" });
    const eraser = screen.getByRole("button", { name: "지우개" });

    fireEvent.mouseEnter(pen);
    act(() => vi.advanceTimersByTime(280));
    expect(screen.getByRole("tooltip").textContent).toContain("선을 그립니다.");

    fireEvent.mouseLeave(pen, { clientX: 500, clientY: 500, relatedTarget: eraser });
    fireEvent.mouseEnter(eraser);
    act(() => vi.advanceTimersByTime(STUDIO_TOOL_HINT_WARM_SWITCH_DELAY_MS - 1));
    expect(screen.getByRole("tooltip").textContent).toContain("선을 그립니다.");

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip").textContent).toContain("선을 지웁니다.");
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("does not open passive help while a mouse button is held for a drag", () => {
    vi.useFakeTimers();
    renderPair();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "펜" }), { buttons: 1 });
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps passive hover help open while its own scroll region is being read", async () => {
    vi.useFakeTimers();
    renderPair();
    const pen = screen.getByRole("button", { name: "펜" });

    fireEvent.mouseEnter(pen);
    await act(async () => {
      vi.advanceTimersByTime(280);
      await Promise.resolve();
      await Promise.resolve();
    });

    const tooltip = screen.getByRole("tooltip");
    const scrollRegion = tooltip.querySelector(
      '[data-studio-tool-hint-scroll-region="true"]'
    );
    expect(scrollRegion).not.toBeNull();

    fireEvent.wheel(scrollRegion as Element);
    fireEvent.scroll(scrollRegion as Element);
    expect(screen.getByRole("tooltip")).toBe(tooltip);

    fireEvent.wheel(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("dismisses transient help when the editor window loses attention", () => {
    renderPair();
    fireEvent.focus(screen.getByRole("button", { name: "펜" }));
    expect(screen.getByRole("tooltip")).toBeTruthy();

    act(() => {
      globalThis.dispatchEvent(new Event("blur"));
    });

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("marks visual-viewport placement and keeps long localized content scrollable", () => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "visualViewport");
    Object.defineProperty(globalThis, "visualViewport", {
      configurable: true,
      value: {
        width: 320,
        height: 500,
        offsetLeft: 40,
        offsetTop: 80,
      },
    });

    try {
      const html = renderToStaticMarkup(
        <StudioToolHintBubble
          expanded={false}
          hint={{
            id: "visual-viewport-hint",
            title: "시각적 뷰포트",
            description: "모바일 브라우저 UI와 화면 키보드가 보이는 영역만 사용합니다.",
          }}
          anchor={{ left: 48, top: 100, right: 88, bottom: 140, width: 40, height: 40 } as DOMRect}
        />
      );

      expect(html).toContain('data-studio-tool-hint-viewport="visual"');
      expect(html).toContain('data-studio-tool-hint-scroll-region="true"');
      expect(html).toContain("max-height:480px");
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(globalThis, "visualViewport", previousDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "visualViewport");
      }
    }
  });
});
