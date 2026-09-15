import { describe, expect, it } from "vitest";

import {
  normalizeStudioCanvasWheelDelta,
  planStudioCanvasWheelNavigation,
  type StudioCanvasWheelNavigationInput,
} from "./studio-canvas-wheel-navigation";

const baseInput = {
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  wheelMode: "zoom",
  reverseWheel: false,
  viewportWidth: 1_200,
  viewportHeight: 800,
} as const satisfies StudioCanvasWheelNavigationInput;

describe("studio canvas wheel navigation", () => {
  it("normalizes pixel, line, and page wheel units", () => {
    expect(normalizeStudioCanvasWheelDelta(3, 0, 900)).toBe(3);
    expect(normalizeStudioCanvasWheelDelta(3, 1, 900)).toBe(48);
    expect(normalizeStudioCanvasWheelDelta(-1, 2, 900)).toBe(-900);
    expect(normalizeStudioCanvasWheelDelta(Number.NaN, 0, 900)).toBe(0);
    expect(normalizeStudioCanvasWheelDelta(1, 2, 0)).toBe(800);
  });

  it("turns a conventional Shift + vertical wheel into horizontal movement", () => {
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaY: 3,
      deltaMode: 1,
      shiftKey: true,
    })).toEqual({
      deltaX: 48,
      deltaY: 0,
      source: "shift-horizontal",
    });
  });

  it("uses a browser-remapped Shift delta only once", () => {
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaX: -90,
      deltaY: -4,
      shiftKey: true,
    })).toEqual({
      deltaX: -90,
      deltaY: 0,
      source: "shift-horizontal",
    });
  });

  it("preserves native horizontal trackpad and Magic Mouse input in every wheel mode", () => {
    for (const wheelMode of ["zoom", "pan", "brush-size"] as const) {
      expect(planStudioCanvasWheelNavigation({
        ...baseInput,
        deltaX: 24,
        deltaY: 3,
        wheelMode,
      })).toEqual({
        deltaX: 24,
        deltaY: 0,
        source: "native-horizontal",
      });
    }
  });

  it("keeps Ctrl/Meta wheel reserved for pointer-anchored zoom", () => {
    for (const modifier of ["ctrlKey", "metaKey"] as const) {
      expect(planStudioCanvasWheelNavigation({
        ...baseInput,
        deltaX: 80,
        deltaY: 3,
        shiftKey: true,
        [modifier]: true,
      })).toBeNull();
    }
  });

  it("does not steal vertical or Shift wheel from brush-size mode", () => {
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaY: -120,
      wheelMode: "brush-size",
    })).toBeNull();
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaY: -120,
      shiftKey: true,
      wheelMode: "brush-size",
    })).toBeNull();
  });

  it("normalizes both axes in configured pan mode and honors reverse direction", () => {
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaX: 1,
      deltaY: -2,
      deltaMode: 1,
      wheelMode: "pan",
      reverseWheel: true,
    })).toEqual({
      deltaX: -16,
      deltaY: 32,
      source: "configured-pan",
    });
  });

  it("returns no pan plan for zero or non-finite input", () => {
    expect(planStudioCanvasWheelNavigation(baseInput)).toBeNull();
    expect(planStudioCanvasWheelNavigation({
      ...baseInput,
      deltaX: Number.POSITIVE_INFINITY,
      deltaY: Number.NaN,
      wheelMode: "pan",
    })).toBeNull();
  });
});
