// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioToolHintPreferencesProvider,
  StudioToolHintTarget,
} from "./StudioToolHint";

function renderHint(id: string, touchHoldDelayMs = 480) {
  return render(
    <StudioToolHintPreferencesProvider
      mode="compact"
      touchHoldDelayMs={touchHoldDelayMs}
      reduceMotion
    >
      <StudioToolHintTarget
        hint={{ id, title: `도구 ${id}`, description: `${id} 동작을 설명합니다.` }}
      >
        <button type="button">{id}</button>
      </StudioToolHintTarget>
    </StudioToolHintPreferencesProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StudioToolHint touch intent", () => {
  it("cancels a pending long-press when a touch becomes a drag", () => {
    vi.useFakeTimers();
    renderHint("크기", 480);
    const target = screen.getByRole("button", { name: "크기" });

    fireEvent.pointerDown(target, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(target, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 36,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(600));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps a stationary touch eligible for long-press help", () => {
    vi.useFakeTimers();
    renderHint("불투명도", 480);
    const target = screen.getByRole("button", { name: "불투명도" });

    fireEvent.pointerDown(target, {
      pointerId: 11,
      pointerType: "touch",
      clientX: 24,
      clientY: 18,
    });
    act(() => vi.advanceTimersByTime(480));

    expect(screen.getByRole("tooltip").textContent).toContain("불투명도 동작을 설명합니다.");
  });

  it("clears global pointer suppression when its provider unmounts", () => {
    vi.useFakeTimers();
    const first = renderHint("첫 도구");
    fireEvent.pointerDown(screen.getByRole("button", { name: "첫 도구" }), {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 12,
      clientY: 12,
    });
    first.unmount();

    renderHint("다음 도구");
    fireEvent.mouseEnter(screen.getByRole("button", { name: "다음 도구" }));
    act(() => vi.advanceTimersByTime(280));

    expect(screen.getByRole("tooltip").textContent).toContain("다음 도구 동작을 설명합니다.");
  });
});
