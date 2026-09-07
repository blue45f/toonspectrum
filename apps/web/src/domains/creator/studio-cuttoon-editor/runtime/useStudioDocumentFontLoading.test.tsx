// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_DOCUMENT_FONTS_LINK_ID,
  STUDIO_PRESET_FONTS_LINK_ID,
  ensureStudioDocumentFontStylesheet,
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

beforeEach(() => {
  ready = deferred();
  fonts = Object.assign(new EventTarget(), { ready: ready.promise });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });

});

afterEach(() => {
  cleanup();
  document.getElementById(STUDIO_DOCUMENT_FONTS_LINK_ID)?.remove();
  vi.restoreAllMocks();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

function fixture(elements: readonly StudioFontBearingElementLike[] = []) {
  const stageRef = { current: { batchDraw: vi.fn() } };
  return { elements, stageRef };
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
    expect(document.getElementById(STUDIO_PRESET_FONTS_LINK_ID)).toBeNull();
    const nextStage = { batchDraw: vi.fn() };
    options.stageRef.current = nextStage;
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(originalStage.batchDraw).not.toHaveBeenCalled();
    expect(nextStage.batchDraw).not.toHaveBeenCalled();
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(nextStage.batchDraw).toHaveBeenCalledTimes(1);
    unmount();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(nextStage.batchDraw).toHaveBeenCalledTimes(1);
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

  it("reuses an existing document stylesheet and schedules its pending ready repaint once", async () => {
    const href = "https://fonts.googleapis.com/css2?family=Jua&display=swap";
    ensureStudioDocumentFontStylesheet(href);
    const link = stylesheet();
    const options = fixture([{ type: "text", font: "Jua" }]);
    renderHook(() => useStudioDocumentFontLoading(options));
    expect(stylesheet()).toBe(link);
    expect(stylesheet()?.href).toBe(href);
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending ready repaint and loadingdone listener on unmount", async () => {
    const options = fixture([{ type: "text", font: "Jua" }]);
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options));
    expect(stylesheet()?.href).toContain("family=Jua");
    unmount();
    await act(async () => { ready.resolve(); await ready.promise; });
    fonts.dispatchEvent(new Event("loadingdone"));
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
    const { unmount } = renderHook(() => useStudioDocumentFontLoading(options), { wrapper: StrictMode });
    expect(document.querySelectorAll(`#${STUDIO_DOCUMENT_FONTS_LINK_ID}`)).toHaveLength(1);
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
    options.stageRef.current.batchDraw.mockClear();
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
    unmount();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
  });

  it("observes non-preset font loads immediately, without waiting for document font preparation", () => {
    const options = fixture([{ type: "text", font: "Uploaded custom font" }]);
    renderHook(() => useStudioDocumentFontLoading(options));
    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(options.stageRef.current.batchDraw).toHaveBeenCalledTimes(1);
    expect(stylesheet()).toBeNull();
  });

  it("ignores ready callbacks for a document that no longer uses preset fonts", async () => {
    const options = fixture([{ type: "text", font: "Jua" }]);
    const { rerender } = renderHook(
      ({ elements }) => useStudioDocumentFontLoading({ ...options, elements }),
      { initialProps: { elements: options.elements } },
    );
    rerender({ elements: [{ type: "image" }] });
    await act(async () => { ready.resolve(); await ready.promise; });
    expect(options.stageRef.current.batchDraw).not.toHaveBeenCalled();
  });
});
