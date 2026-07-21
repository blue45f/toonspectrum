import { describe, expect, it } from "vitest";

import {
  isStudioCanvasInteractionBlocked,
  studioCanvasCursorClassName,
  studioCanvasViewportCursorClassName,
  type StudioCanvasCursorInput,
} from "./studio-canvas-cursor";

const interactionBase = {
  activeSurfaceReviewLocked: true,
  commentPinArmed: true,
  canCreateStudioComment: true,
  saving: false,
  documentReloadRequired: false,
  sourceHydrationPending: false,
  workHydrationFailed: false,
  collaborationDocumentUnavailable: false,
} as const;

const base: StudioCanvasCursorInput = {
  tool: "select",
  drawMode: "pen",
  isSpacePressed: false,
  isPanning: false,
  interactionBlocked: false,
  commentPinArmed: false,
  eyedropperActive: false,
  advancedFillArmed: false,
  cropArmed: false,
  pixelToolArmed: false,
  panelSplitArmed: false,
  nodeEditArmed: false,
  bubbleShapeArmed: false,
  puppetWarpArmed: false,
  perspectiveRulerActive: false,
  precisionBrushArmed: false,
};

describe("studioCanvasCursorClassName", () => {
  it("admits only an authorized comment placement through a read-only document lock", () => {
    const interactionBlocked = isStudioCanvasInteractionBlocked(interactionBase);

    expect(interactionBlocked).toBe(false);
    expect(studioCanvasCursorClassName({
      ...base,
      interactionBlocked,
      commentPinArmed: true,
    })).toBe("cursor-crosshair");
    expect(isStudioCanvasInteractionBlocked({
      ...interactionBase,
      commentPinArmed: false,
    })).toBe(true);
    expect(isStudioCanvasInteractionBlocked({
      ...interactionBase,
      canCreateStudioComment: false,
    })).toBe(true);
    expect(isStudioCanvasInteractionBlocked({
      ...interactionBase,
      activeSurfaceReviewLocked: false,
      commentPinArmed: false,
      canCreateStudioComment: false,
    })).toBe(false);
  });

  it.each([
    "saving",
    "documentReloadRequired",
    "sourceHydrationPending",
    "workHydrationFailed",
    "collaborationDocumentUnavailable",
  ] as const)("keeps the %s barrier absolute during comment placement", (barrier) => {
    expect(isStudioCanvasInteractionBlocked({
      ...interactionBase,
      [barrier]: true,
    })).toBe(true);
  });

  it("distinguishes select, hand and active pan modes", () => {
    expect(studioCanvasCursorClassName(base)).toBe("cursor-default");
    expect(studioCanvasCursorClassName({ ...base, tool: "hand" })).toBe("cursor-grab");
    expect(studioCanvasCursorClassName({ ...base, tool: "hand", isPanning: true })).toBe("cursor-grabbing");
  });

  it("keeps paper-only precision cursors out of the surrounding scroll workspace", () => {
    expect(studioCanvasViewportCursorClassName({
      tool: "select",
      isSpacePressed: false,
      isPanning: false,
      interactionBlocked: false,
    })).toBe("cursor-default");
    expect(studioCanvasViewportCursorClassName({
      tool: "hand",
      isSpacePressed: false,
      isPanning: false,
      interactionBlocked: false,
    })).toBe("cursor-grab");
  });

  it("uses crosshairs for placement, selection and geometric editing", () => {
    expect(studioCanvasCursorClassName({ ...base, commentPinArmed: true })).toBe("cursor-crosshair");
    expect(studioCanvasCursorClassName({ ...base, eyedropperActive: true })).toBe("cursor-crosshair");
    expect(studioCanvasCursorClassName({ ...base, pixelToolArmed: true })).toBe("cursor-crosshair");
    expect(studioCanvasCursorClassName({ ...base, cropArmed: true })).toBe("cursor-crosshair");
    expect(studioCanvasCursorClassName({ ...base, tool: "draw", drawMode: "shape" })).toBe("cursor-crosshair");
    expect(studioCanvasCursorClassName({ ...base, tool: "draw", drawMode: "pixel" })).toBe("cursor-crosshair");
  });

  it("lets precision brush rings replace the obscuring system pointer", () => {
    expect(studioCanvasCursorClassName({ ...base, tool: "draw", drawMode: "pen" })).toBe("cursor-none");
    expect(studioCanvasCursorClassName({ ...base, precisionBrushArmed: true })).toBe("cursor-none");
  });

  it("keeps blocked and active-pan states higher priority than tool hints", () => {
    expect(studioCanvasCursorClassName({ ...base, interactionBlocked: true, commentPinArmed: true })).toBe("cursor-not-allowed");
    expect(studioCanvasCursorClassName({ ...base, isPanning: true, precisionBrushArmed: true })).toBe("cursor-grabbing");
  });
});
