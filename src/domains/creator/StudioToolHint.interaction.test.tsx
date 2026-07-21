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

function renderHintPair() {
  return render(
    <StudioToolHintPreferencesProvider
      mode="compact"
      touchHoldDelayMs={480}
      reduceMotion
    >
      <StudioToolHintTarget
        hint={{ id: "pen", title: "펜", description: "선을 그립니다." }}
      >
        <button type="button">펜</button>
      </StudioToolHintTarget>
      <StudioToolHintTarget
        hint={{ id: "eraser", title: "지우개", description: "선을 지웁니다." }}
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

  it("does not let an older hover delay replace a newly focused hint", () => {
    vi.useFakeTimers();
    renderHintPair();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "펜" }));
    fireEvent.focus(screen.getByRole("button", { name: "지우개" }));

    expect(screen.getByRole("tooltip").textContent).toContain("선을 지웁니다.");
    act(() => vi.advanceTimersByTime(320));

    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toContain("선을 지웁니다.");
    expect(screen.queryByText("선을 그립니다.")).toBeNull();
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
