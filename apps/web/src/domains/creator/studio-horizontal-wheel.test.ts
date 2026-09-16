import { describe, expect, it } from "vitest";

import { resolveStudioHorizontalWheelDelta } from "./studio-horizontal-wheel";

const metrics = {
  scrollLeft: 120,
  scrollWidth: 1_200,
  clientWidth: 400,
};

describe("resolveStudioHorizontalWheelDelta", () => {
  it("supports trackpads, Shift+wheel and ordinary mouse wheels", () => {
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 45,
          deltaY: 2,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        },
        metrics,
      ),
    ).toBe(45);
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 0,
          deltaY: 3,
          deltaMode: 1,
          shiftKey: true,
          ctrlKey: false,
          metaKey: false,
        },
        metrics,
      ),
    ).toBe(84);
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 0,
          deltaY: 36,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        },
        metrics,
      ),
    ).toBe(36);
  });

  it("preserves zoom gestures and releases wheel input at boundaries", () => {
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 40,
          deltaY: 0,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: true,
          metaKey: false,
        },
        metrics,
      ),
    ).toBe(0);
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 40,
          deltaY: 0,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        },
        { ...metrics, scrollWidth: 400 },
      ),
    ).toBe(0);
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: -40,
          deltaY: 0,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        },
        { ...metrics, scrollLeft: 0 },
      ),
    ).toBe(0);
    expect(
      resolveStudioHorizontalWheelDelta(
        {
          deltaX: 40,
          deltaY: 0,
          deltaMode: 0,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        },
        { ...metrics, scrollLeft: 800 },
      ),
    ).toBe(0);
  });
});
