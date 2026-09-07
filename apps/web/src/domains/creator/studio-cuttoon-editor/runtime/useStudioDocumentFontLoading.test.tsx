// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_DOCUMENT_FONTS_LINK_ID,
  STUDIO_PRESET_FONTS_LINK_ID,
  type StudioFontBearingElementLike,
} from "../../studio-preset-font-loading";
import { useStudioDocumentFontLoading } from "./useStudioDocumentFontLoading";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
let ready: ReturnType<typeof deferred>;
let fonts: EventTarget & { ready: Promise<void> };
let idleCallbacks: Map<number, () => void>;

beforeEach(() => {
  vi.useFakeTimers();
  ready = deferred();
  fonts = Object.assign(new EventTarget(), { ready: ready.promise });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  idleCallbacks = new Map();
  let nextId = 0;
  vi.stubGlobal("requestIdleCallback", vi.fn((callback: () => void) => {
    const id = ++nextId;
    idleCallbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelIdleCallback", vi.fn((id: number) => idleCallbacks.delete(id)));
});

afterEach(() => {
  cleanup();
  document.getElementById(STUDIO_DOCUMENT_FONTS_LINK_ID)?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

function flushIdle() {
  const callbacks = [...idleCallbacks.values()];
  idleCallbacks.clear();
  act(() => { callbacks.forEach((callback) => callback()); });
}

function fixture(elements: readonly StudioFontBearingElementLike[] = []) {
  const stageRef = { current: { batchDraw: vi.fn() } };
  const activeElementsRef = { current: elements };
  return { elements, activeElementsRef, stageRef };
}

function stylesheet(): HTMLLinkElement | null {
  return document.getElementById(STUDIO_DOCUMENT_FONTS_LINK_ID) as HTMLLinkElement | null;
}

describe("useStudioDocumentFontLoading", () => {
  it("does not request unused fonts and repaints the current stage when browser fonts arrive", async () => {
    const options = fixture([{ type: "image" }]);
    const originalStage = options.stageRef.current;
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options));
    expect(stylesheet()).toBeNull();
    flushIdle();
    expect(stylesheet()).toBeNull();
    expect(document.getElementById(STUDIO_PRESET_FONTS_LINK_ID)).toBeNull();
    const nextStage = { batchDraw: vi.fn() };
    options.stageRef.current = nextStage;
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(originalStage.batchDraw).not.toHaveBeenCalled();
    expect(nextStage.batchDraw).toHaveBeenCalledTimes(1);
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(nextStage.batchDraw).toHaveBeenCalledTimes(2);
    unmount();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(nextStage.batchDraw).toHaveBeenCalledTimes(2);
  });

  it("updates one stylesheet for late document fonts and repaints when its new href finishes", async () => {
    const options = fixture();
    const { rerender } = renderHook(
      ({ elements }) => useStudioDocumentFontLoading({ ...options, elements }),
      { initialProps: { elements: options.elements } },
    );
    expect(stylesheet()).toBeNull();
    rerender({ elements: [{ type: "text", font: "Jua" }] });
    const link = stylesheet();
    expect(link?.href).toContain("family=Jua");
    expect(link?.href).not.toContain("Gaegu");
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);

    const nextLoad = deferred();
    fonts.ready = nextLoad.promise;
    rerender({ elements: [{ type: "text", font: "Gaegu" }] });
    expect(stylesheet()).toBe(link);
    expect(link?.href).toContain("family=Gaegu");
    expect(link?.href).not.toContain("family=Jua");
    await act(async () => { nextLoad.resolve(); await nextLoad.promise; });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(2);
    rerender({ elements: [{ type: "bubble", font: "Gaegu" }, { type: "image" }] });
    await act(async () => { await Promise.resolve(); });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll(`#${STUDIO_DOCUMENT_FONTS_LINK_ID}`)).toHaveLength(1);
  });

  it("reads the latest active elements when idle preparation finally runs", () => {
    const options = fixture();
    renderHook(() => useStudioDocumentFontLoading(options));
    options.activeElementsRef.current = [{ type: "text", font: "Jua" }];
    flushIdle();
    expect(stylesheet()?.href).toContain("family=Jua");
  });

  it("cancels deferred work and pending ready repaint when unmounted before idle", async () => {
    const options = fixture([{ type: "text", font: "Jua" }]);
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options));
    const queued = [...idleCallbacks.values()];
    unmount();
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledTimes(1);
    queued.forEach((callback) => callback());
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).not.toHaveBeenCalled();
  });

  it("cancels an older document ready callback when its font set changes", async () => {
    const options = fixture([{ type: "text", font: "Jua" }]);
    const { rerender } = renderHook(
      ({ elements }) => useStudioDocumentFontLoading({ ...options, elements }),
      { initialProps: { elements: options.elements } },
    );
    const nextLoad = deferred();
    fonts.ready = nextLoad.promise;
    rerender({ elements: [{ type: "text", font: "Gaegu" }] });
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).not.toHaveBeenCalled();
    await act(async () => { nextLoad.resolve(); await nextLoad.promise; });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
  });

  it("keeps one stylesheet and active listener across StrictMode setup and cleanup", async () => {
    const options = fixture([{ type: "text", font: "Jua" }]);
    const add = vi.spyOn(fonts, "addEventListener");
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options), { wrapper: StrictMode });
    expect(globalThis.requestIdleCallback).toHaveBeenCalledTimes(2);
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(`#${STUDIO_DOCUMENT_FONTS_LINK_ID}`)).toHaveLength(1);
    flushIdle();
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => { ready.resolve(); await ready.promise; });
    options.stageRef.current.batchDraw.mockClear();
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
    unmount();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("cleans up timer fallback and font-ready callbacks (idle ran=%s)", async (runIdle) => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);
    const options = fixture();
    const add = vi.spyOn(fonts, "addEventListener");
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options));
    if (runIdle) act(() => { vi.advanceTimersByTime(300); });
    expect(add).toHaveBeenCalledTimes(runIdle ? 1 : 0);
    unmount();
    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => { ready.resolve(); await ready.promise; });
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(options.stageRef.current.batchDraw).not.toHaveBeenCalled();
  });
});
