// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_STROKE_FOCUS_SETTLE_MS,
  resetStudioStrokeFocusActivityForTests,
  setStudioStrokeFocusActivity,
  shouldActivateStudioStrokeFocusForPointer,
  studioStrokeFocusActivitySnapshot,
  subscribeStudioStrokeFocusActivity,
} from "./studio-stroke-focus-activity";

beforeEach(() => {
  vi.useFakeTimers();
  resetStudioStrokeFocusActivityForTests();
});

afterEach(() => {
  resetStudioStrokeFocusActivityForTests();
  vi.useRealTimers();
});

describe("studio stroke focus activity", () => {
  it("keeps mobile finger pointerdown out of shell-focus layout mutations", () => {
    expect(shouldActivateStudioStrokeFocusForPointer("touch")).toBe(false);
    expect(shouldActivateStudioStrokeFocusForPointer("pen")).toBe(true);
    expect(shouldActivateStudioStrokeFocusForPointer("mouse")).toBe(true);
  });

  it("publishes drawing synchronously and holds a settling window after release", () => {
    const phases: string[] = [];
    const unsubscribe = subscribeStudioStrokeFocusActivity(() => {
      phases.push(studioStrokeFocusActivitySnapshot());
    });

    setStudioStrokeFocusActivity("canvas-stroke", true);
    expect(studioStrokeFocusActivitySnapshot()).toBe("drawing");
    expect(document.documentElement.dataset.studioStrokeFocusPhase).toBe("drawing");

    setStudioStrokeFocusActivity("canvas-stroke", false);
    expect(studioStrokeFocusActivitySnapshot()).toBe("settling");
    expect(document.documentElement.dataset.studioStrokeFocusPhase).toBe("settling");

    vi.advanceTimersByTime(STUDIO_STROKE_FOCUS_SETTLE_MS - 1);
    expect(studioStrokeFocusActivitySnapshot()).toBe("settling");
    vi.advanceTimersByTime(1);
    expect(studioStrokeFocusActivitySnapshot()).toBe("idle");
    expect(document.documentElement.hasAttribute("data-studio-stroke-focus-phase")).toBe(false);
    expect(phases).toEqual(["drawing", "settling", "idle"]);
    unsubscribe();
  });

  it("cancels the pending restore when the next stroke begins", () => {
    setStudioStrokeFocusActivity("canvas-stroke", true);
    setStudioStrokeFocusActivity("canvas-stroke", false);
    vi.advanceTimersByTime(STUDIO_STROKE_FOCUS_SETTLE_MS / 2);

    setStudioStrokeFocusActivity("canvas-stroke", true);
    vi.advanceTimersByTime(STUDIO_STROKE_FOCUS_SETTLE_MS);
    expect(studioStrokeFocusActivitySnapshot()).toBe("drawing");

    setStudioStrokeFocusActivity("canvas-stroke", false);
    vi.advanceTimersByTime(STUDIO_STROKE_FOCUS_SETTLE_MS);
    expect(studioStrokeFocusActivitySnapshot()).toBe("idle");
  });
});
