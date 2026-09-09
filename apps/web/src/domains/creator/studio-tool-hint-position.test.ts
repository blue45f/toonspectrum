import { describe, expect, it } from "vitest";

import {
  planStudioToolHintPosition,
  readStudioToolHintViewport,
} from "./studio-tool-hint-position";

const anchor = (left: number, top: number, width = 40, height = 40) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe("planStudioToolHintPosition", () => {
  it("prefers the right side of a desktop tool rail", () => {
    expect(
      planStudioToolHintPosition({
        anchor: anchor(12, 200),
        viewportWidth: 1280,
        viewportHeight: 800,
        popupWidth: 304,
        popupHeight: 220,
      })
    ).toMatchObject({ left: 64, top: 110, side: "right", arrowOffset: 110 });
  });

  it("flips left when a control is close to the right edge", () => {
    const result = planStudioToolHintPosition({
      anchor: anchor(1210, 120),
      viewportWidth: 1280,
      viewportHeight: 800,
      popupWidth: 304,
      popupHeight: 220,
    });
    expect(result.side).toBe("left");
    expect(result.left).toBe(894);
  });

  it("uses a vertical side on a narrow mobile viewport", () => {
    const result = planStudioToolHintPosition({
      anchor: anchor(160, 80),
      viewportWidth: 360,
      viewportHeight: 740,
      popupWidth: 328,
      popupHeight: 210,
    });
    expect(result.side).toBe("bottom");
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + 328).toBeLessThanOrEqual(352);
  });

  it("clamps both axes for unusually small viewports", () => {
    const result = planStudioToolHintPosition({
      anchor: anchor(2, 2, 20, 20),
      viewportWidth: 260,
      viewportHeight: 180,
      popupWidth: 244,
      popupHeight: 164,
      preferredSide: "top",
    });
    expect(result.left).toBe(8);
    expect(result.top).toBe(8);
    expect(result.arrowOffset).toBeGreaterThanOrEqual(16);
  });

  it("reserves rich-coach dimensions before expansion so the side stays stable", () => {
    const compact = planStudioToolHintPosition({
      anchor: anchor(720, 240),
      viewportWidth: 1024,
      viewportHeight: 768,
      popupWidth: 240,
      popupHeight: 112,
      selectionPopupWidth: 304,
      selectionPopupHeight: 312,
    });
    const expanded = planStudioToolHintPosition({
      anchor: anchor(720, 240),
      viewportWidth: 1024,
      viewportHeight: 768,
      popupWidth: 304,
      popupHeight: 312,
      selectionPopupWidth: 304,
      selectionPopupHeight: 312,
      previousSide: compact.side,
    });

    expect(compact.side).toBe("left");
    expect(expanded.side).toBe(compact.side);
  });

  it("uses hysteresis when the reserved size misses by only measurement noise", () => {
    const result = planStudioToolHintPosition({
      anchor: anchor(664, 220),
      viewportWidth: 1024,
      viewportHeight: 768,
      popupWidth: 240,
      popupHeight: 112,
      selectionPopupWidth: 304,
      selectionPopupHeight: 312,
      previousSide: "right",
    });

    expect(result.side).toBe("right");
  });

  it("clamps into an offset visual viewport instead of the hidden layout viewport", () => {
    const result = planStudioToolHintPosition({
      anchor: anchor(112, 84, 32, 32),
      viewportLeft: 100,
      viewportTop: 60,
      viewportWidth: 360,
      viewportHeight: 640,
      popupWidth: 328,
      popupHeight: 210,
      preferredSide: "top",
    });

    expect(result.left).toBeGreaterThanOrEqual(108);
    expect(result.left + 328).toBeLessThanOrEqual(452);
    expect(result.top).toBeGreaterThanOrEqual(68);
    expect(result.top + 210).toBeLessThanOrEqual(692);
  });
});

describe("readStudioToolHintViewport", () => {
  it("prefers VisualViewport dimensions and offsets when browser chrome changes", () => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "visualViewport");
    Object.defineProperty(globalThis, "visualViewport", {
      configurable: true,
      value: {
        width: 320,
        height: 480,
        offsetLeft: 42,
        offsetTop: 96,
      },
    });

    try {
      expect(readStudioToolHintViewport()).toEqual({
        left: 42,
        top: 96,
        right: 362,
        bottom: 576,
        width: 320,
        height: 480,
        source: "visual",
      });
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(globalThis, "visualViewport", previousDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "visualViewport");
      }
    }
  });
});
