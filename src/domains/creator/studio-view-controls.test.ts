import { describe, expect, it } from "vitest";

import {
  captureStudioView,
  clampStudioViewZoom,
  fitStudioViewToWidth,
  planStudioViewRestore,
  resolveStudioViewShortcut,
  stepStudioViewZoom,
} from "./studio-view-controls";

describe("studio view shortcuts", () => {
  it.each([
    [{ code: "Equal" }, "zoom-in"],
    [{ code: "Minus" }, "zoom-out"],
    [{ code: "KeyH" }, "flip-horizontal"],
    [{ code: "Home" }, "fit-width"],
    [{ code: "End" }, "actual-pixels"],
    [{ code: "F11" }, "fullscreen"],
    [{ code: "KeyQ" }, "toggle-grayscale"],
    [{ code: "KeyS", shiftKey: true }, "save-view"],
    [{ code: "KeyZ", shiftKey: true }, "restore-view"],
    [{ code: "KeyG", shiftKey: true }, "toggle-perspective-guide"],
  ] as const)("maps %o to %s", (event, expected) => {
    expect(resolveStudioViewShortcut(event)).toBe(expected);
  });

  it("keeps modifier aliases and composing input available to other handlers", () => {
    expect(resolveStudioViewShortcut({ code: "Equal", metaKey: true })).toBeNull();
    expect(resolveStudioViewShortcut({ code: "Minus", ctrlKey: true })).toBeNull();
    expect(resolveStudioViewShortcut({ code: "KeyQ", altKey: true })).toBeNull();
    expect(resolveStudioViewShortcut({ code: "KeyS", shiftKey: true, repeat: true })).toBeNull();
    expect(resolveStudioViewShortcut({ code: "KeyQ", isComposing: true })).toBeNull();
    expect(resolveStudioViewShortcut({ code: "KeyQ", keyCode: 229 })).toBeNull();
  });

  it("allows held zoom keys but prevents repeated toggles", () => {
    expect(resolveStudioViewShortcut({ code: "Equal", repeat: true })).toBe("zoom-in");
    expect(resolveStudioViewShortcut({ code: "Minus", repeat: true })).toBe("zoom-out");
    expect(resolveStudioViewShortcut({ code: "KeyH", repeat: true })).toBeNull();
  });
});

describe("studio view zoom", () => {
  it("uses one bounded, 0.05-aligned step for menu and shortcuts", () => {
    expect(stepStudioViewZoom(1, 1)).toBe(1.2);
    expect(stepStudioViewZoom(1, -1)).toBe(0.8);
    expect(stepStudioViewZoom(5, 1)).toBe(5);
    expect(stepStudioViewZoom(0.2, -1)).toBe(0.2);
    expect(clampStudioViewZoom(Number.NaN)).toBe(1);
  });

  it("fits the webtoon canvas width with product scale bounds", () => {
    expect(fitStudioViewToWidth(720, 720, 2.5)).toBe(1);
    expect(fitStudioViewToWidth(1800, 720, 2.5)).toBe(2.5);
    expect(fitStudioViewToWidth(36, 720, 2.5)).toBe(0.1);
  });
});

describe("studio view snapshots", () => {
  it("restores the same document center after viewport dimensions change", () => {
    const snapshot = captureStudioView({
      pageId: "page-1",
      scale: 1.5,
      zoom: 2,
      scrollLeft: 900,
      scrollTop: 1_800,
      viewportWidth: 600,
      viewportHeight: 800,
      canvasFlipH: true,
    });

    expect(snapshot.centerX).toBe(400);
    expect(snapshot.centerY).toBeCloseTo(733.333333, 5);

    const restored = planStudioViewRestore({
      snapshot,
      pageId: "page-1",
      viewportWidth: 400,
      viewportHeight: 600,
      canvasWidth: 720,
      canvasHeight: 2_000,
    });

    expect(restored).toEqual({
      scale: 1.5,
      zoom: 2,
      scrollLeft: 1_000,
      scrollTop: 1_900,
      canvasFlipH: true,
    });
  });

  it("does not restore a saved view onto another page", () => {
    const snapshot = captureStudioView({
      pageId: "page-1",
      scale: 1,
      zoom: 1,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 720,
      viewportHeight: 800,
      canvasFlipH: false,
    });
    expect(planStudioViewRestore({
      snapshot,
      pageId: "page-2",
      viewportWidth: 720,
      viewportHeight: 800,
      canvasWidth: 720,
      canvasHeight: 1_080,
    })).toBeNull();
  });

  it("clamps restored scrolling to the canvas bounds", () => {
    const snapshot = {
      pageId: "page-1",
      scale: 1,
      zoom: 1,
      centerX: 10_000,
      centerY: 10_000,
      canvasFlipH: false,
    };
    expect(planStudioViewRestore({
      snapshot,
      pageId: "page-1",
      viewportWidth: 500,
      viewportHeight: 600,
      canvasWidth: 720,
      canvasHeight: 1_080,
    })).toMatchObject({ scrollLeft: 220, scrollTop: 480 });
  });
});
