/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioVrmViewportBudget } from "./useStudioVrmViewportBudget";

let width = 390;
let height = 600;
let coarse = true;
let observerCallback: (() => void) | null = null;
const disconnect = vi.fn();
const query = new EventTarget();
const element = document.createElement("div");
const ref = { current: element };

beforeEach(() => {
  width = 390; height = 600; coarse = true;
  vi.useFakeTimers();
  vi.stubGlobal("devicePixelRatio", 3);
  vi.stubGlobal("matchMedia", () => ({ get matches() { return coarse; },
    addEventListener: query.addEventListener.bind(query), removeEventListener: query.removeEventListener.bind(query) }));
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, height));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { observerCallback = callback; }
    observe() {}
    disconnect = disconnect;
  });
  disconnect.mockClear();
  document.body.append(element);
});
afterEach(() => {
  cleanup(); element.remove(); observerCallback = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("VRM 작업면 예산 수명주기", () => {
  it("터치 환경을 제한하고 화면 크기 변경 시 다시 계산한다", async () => {
    const hook = renderHook(() => useStudioVrmViewportBudget(ref, false));
    expect(hook.result.current.dpr).toBe(1.5);
    width = 2000; height = 1500;
    await act(async () => { observerCallback?.(); await vi.advanceTimersByTimeAsync(30); });
    expect(width * height * hook.result.current.dpr ** 2).toBeLessThanOrEqual(1_500_000.001);
  });
  it("캡처 중에는 해상도를 바꾸지 않고 완료 후 최신 크기에 맞춘다", async () => {
    const hook = renderHook(({ capture }) => useStudioVrmViewportBudget(ref, capture), { initialProps: { capture: false } });
    hook.rerender({ capture: true });
    expect(disconnect).toHaveBeenCalled();
    width = 2000; height = 1500;
    await act(async () => { window.dispatchEvent(new Event("resize")); await vi.advanceTimersByTimeAsync(30); });
    expect(hook.result.current.dpr).toBe(1.5);
    hook.rerender({ capture: false });
    expect(hook.result.current.dpr).toBeLessThan(1);
  });
  it("숨겨진 탭과 다시 열린 탭의 표시 상태를 갱신한다", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const hook = renderHook(() => useStudioVrmViewportBudget(ref, false));
    expect(hook.result.current.visible).toBe(true);
    act(() => { visibility.mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.visible).toBe(false);
    act(() => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.visible).toBe(true);
  });
  it("언마운트 시 관찰자와 예약 측정을 정리한다", () => {
    const hook = renderHook(() => useStudioVrmViewportBudget(ref, false));
    act(() => { observerCallback?.(); });
    hook.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
