// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMotionPanelClock } from "./useMotionPanelClock";

let reduced = false, hidden = false; let frame: FrameRequestCallback | undefined;
const mediaListeners = new Set<() => void>();
beforeEach(() => {
  reduced = false; hidden = false; frame = undefined;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(() => { frame = undefined; }));
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener: (_name: string, listener: () => void) => mediaListeners.add(listener), removeEventListener: (_name: string, listener: () => void) => mediaListeners.delete(listener) }));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => hidden ? "hidden" : "visible");
});
afterEach(() => { cleanup(); mediaListeners.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("finite, user-controlled motion playback", () => {
  it("never auto-starts and pauses at the current position", () => {
    const { result } = renderHook(useMotionPanelClock); expect(result.current.playing).toBe(false); expect(frame).toBeUndefined();
    act(() => result.current.play()); act(() => frame?.(1500)); expect(result.current.progress).toBe(.3);
    act(() => result.current.pause()); expect(frame).toBeUndefined(); expect(result.current.progress).toBe(.3);
  });
  it("ends after one run and restarts only after an explicit action", () => {
    const { result } = renderHook(useMotionPanelClock); act(() => result.current.play()); act(() => frame?.(6000));
    expect(result.current.playing).toBe(false); expect(result.current.progress).toBe(1);
    act(() => result.current.play()); expect(result.current.progress).toBe(0); expect(result.current.playing).toBe(true);
  });
  it("stops on hidden tabs, without auto-resuming on return", () => {
    const { result } = renderHook(useMotionPanelClock); act(() => result.current.play()); act(() => frame?.(1000));
    act(() => { hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.playing).toBe(false); expect(frame).toBeUndefined();
    act(() => { hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.playing).toBe(false); expect(result.current.progress).toBe(.2);
  });
  it("honors changes to reduced-motion preferences while allowing manual seeking", () => {
    const { result } = renderHook(useMotionPanelClock); act(() => result.current.play());
    act(() => { reduced = true; mediaListeners.forEach((listener) => listener()); });
    expect(result.current.playing).toBe(false); expect(result.current.canAnimate).toBe(false);
    act(() => result.current.play()); expect(result.current.playing).toBe(false);
    act(() => result.current.seek(.8)); expect(result.current.progress).toBe(.8);
    act(() => { reduced = false; mediaListeners.forEach((listener) => listener()); }); expect(result.current.playing).toBe(false);
  });
  it("cleans animation frames and listeners on unmount", () => {
    const { result, unmount } = renderHook(useMotionPanelClock); act(() => result.current.play()); unmount();
    expect(frame).toBeUndefined(); expect(mediaListeners.size).toBe(0);
  });
});
