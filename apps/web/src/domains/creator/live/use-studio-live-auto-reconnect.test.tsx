// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioLiveAutoReconnect, STUDIO_LIVE_AUTO_RECONNECT_DELAYS } from "./use-studio-live-auto-reconnect";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const input = () => ({ scopeKey: "user/work", enabled: true, failed: true, connected: false, retry: vi.fn() });

describe("service-owned collaboration reconnection", () => {
  it("recovers a failed initial generation without a user click", () => {
    const options = input();
    const { result } = renderHook(() => useStudioLiveAutoReconnect(options));
    expect(result.current).toBe("waiting");
    act(() => vi.advanceTimersByTime(1_999));
    expect(options.retry).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(options.retry).toHaveBeenCalledOnce();
    expect(result.current).toBe("retrying");
  });
  it("bounds retries and does not multiply timers on visibility or online events", () => {
    const options = input();
    const { result, rerender } = renderHook(props => useStudioLiveAutoReconnect(props), { initialProps: options });
    for (const delay of STUDIO_LIVE_AUTO_RECONNECT_DELAYS) {
      act(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
      act(() => vi.advanceTimersByTime(delay));
      rerender({ ...options, failed: false });
      rerender(options);
    }
    expect(result.current).toBe("exhausted");
    act(() => { window.dispatchEvent(new Event("online")); vi.advanceTimersByTime(60_000); });
    expect(options.retry).toHaveBeenCalledTimes(3);
  });
  it.each(["offline", "hidden"] as const)("pauses while %s and resumes automatically", reason => {
    const options = input();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(reason !== "offline");
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue(reason === "hidden" ? "hidden" : "visible");
    const { result } = renderHook(() => useStudioLiveAutoReconnect(options));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe("paused"); expect(options.retry).not.toHaveBeenCalled();
    online.mockReturnValue(true); visible.mockReturnValue("visible");
    act(() => window.dispatchEvent(new Event("online")));
    act(() => vi.advanceTimersByTime(2_000));
    expect(options.retry).toHaveBeenCalledOnce();
  });
  it.each([{ enabled: false }, { failed: false }, { connected: true }])("does not retry a forbidden or live generation: %j", state => {
    const options = { ...input(), ...state };
    renderHook(() => useStudioLiveAutoReconnect(options));
    act(() => vi.advanceTimersByTime(60_000)); expect(options.retry).not.toHaveBeenCalled();
  });
  it("cancels on revocation and unmount", () => {
    const options = input();
    const { rerender, unmount } = renderHook(props => useStudioLiveAutoReconnect(props), { initialProps: options });
    rerender({ ...options, enabled: false });
    act(() => vi.advanceTimersByTime(60_000)); expect(options.retry).not.toHaveBeenCalled();
    rerender(options); unmount();
    act(() => vi.advanceTimersByTime(60_000)); expect(options.retry).not.toHaveBeenCalled();
  });
  it("resets the retry budget for another work without retrying the previous work", () => {
    const options = input();
    const { rerender } = renderHook(props => useStudioLiveAutoReconnect(props), { initialProps: options });
    act(() => vi.advanceTimersByTime(1_000));
    const next = { ...options, scopeKey: "user/next", retry: vi.fn() };
    rerender(next);
    act(() => vi.advanceTimersByTime(2_000));
    expect(options.retry).not.toHaveBeenCalled(); expect(next.retry).toHaveBeenCalledOnce();
  });
});
