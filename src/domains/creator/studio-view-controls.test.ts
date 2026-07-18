import { describe, expect, it } from "vitest";

import {
  captureStudioView,
  clampStudioViewZoom,
  fitStudioViewToWidth,
  normalizeStudioViewRotation,
  planStudioViewRestore,
  planStudioViewRotationTransition,
  planStudioViewScrollToDocumentPoint,
  planStudioViewStageLayout,
  projectStudioDocumentPointToView,
  projectStudioDocumentRectToViewRect,
  projectStudioViewPointToDocument,
  projectStudioViewRectToDocumentRect,
  resolveStudioViewShortcut,
  rotateStudioViewLeft,
  rotateStudioViewRight,
  stepStudioViewZoom,
} from "./studio-view-controls";

describe("studio view shortcuts", () => {
  it.each([
    [{ code: "Equal" }, "zoom-in"],
    [{ code: "Minus" }, "zoom-out"],
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

  it("leaves H to the configurable application shortcut authority", () => {
    expect(resolveStudioViewShortcut({ code: "KeyH", key: "h" })).toBeNull();
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

describe("studio view rotation", () => {
  it.each([
    [0, 0],
    [90, 90],
    [360, 0],
    [450, 90],
    [-90, 270],
    [-450, 270],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ] as const)("normalizes %s degrees to %s", (input, expected) => {
    expect(normalizeStudioViewRotation(input)).toBe(expected);
  });

  it("rotates left and right by one canonical quarter turn", () => {
    expect(rotateStudioViewRight(0)).toBe(90);
    expect(rotateStudioViewRight(270)).toBe(0);
    expect(rotateStudioViewLeft(0)).toBe(270);
    expect(rotateStudioViewLeft(90)).toBe(0);
  });

  it.each([
    [0, false, { width: 360, height: 540, x: 0, y: 0, rotation: 0, scaleX: 0.5, scaleY: 0.5 }],
    [90, false, { width: 540, height: 360, x: 540, y: 0, rotation: 90, scaleX: 0.5, scaleY: 0.5 }],
    [180, false, { width: 360, height: 540, x: 360, y: 540, rotation: 180, scaleX: 0.5, scaleY: 0.5 }],
    [270, false, { width: 540, height: 360, x: 0, y: 360, rotation: 270, scaleX: 0.5, scaleY: 0.5 }],
    [0, true, { width: 360, height: 540, x: 360, y: 0, rotation: 0, scaleX: -0.5, scaleY: 0.5 }],
    [90, true, { width: 540, height: 360, x: 0, y: 0, rotation: 90, scaleX: 0.5, scaleY: -0.5 }],
    [180, true, { width: 360, height: 540, x: 0, y: 540, rotation: 180, scaleX: -0.5, scaleY: 0.5 }],
    [270, true, { width: 540, height: 360, x: 540, y: 360, rotation: 270, scaleX: 0.5, scaleY: -0.5 }],
  ] as const)("lays out rotation=%s flipH=%s", (canvasRotation, canvasFlipH, expected) => {
    expect(planStudioViewStageLayout({
      documentWidth: 720,
      documentHeight: 1_080,
      scale: 0.5,
      canvasFlipH,
      canvasRotation,
    })).toEqual(expected);
  });

  it.each([
    [0, false, { x: 20, y: 30 }],
    [90, false, { x: 170, y: 20 }],
    [180, false, { x: 80, y: 170 }],
    [270, false, { x: 30, y: 80 }],
    [0, true, { x: 80, y: 30 }],
    [90, true, { x: 30, y: 20 }],
    [180, true, { x: 20, y: 170 }],
    [270, true, { x: 170, y: 80 }],
  ] as const)(
    "round-trips a point for rotation=%s flipH=%s",
    (canvasRotation, canvasFlipH, expected) => {
      const projected = projectStudioDocumentPointToView({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH,
        canvasRotation,
        x: 20,
        y: 30,
      });
      expect(projected).toMatchObject(expected);
      expect(projectStudioViewPointToDocument({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH,
        canvasRotation,
        x: projected.x,
        y: projected.y,
      })).toEqual({ x: 20, y: 30 });
    }
  );

  it.each([0, 90, 180, 270] as const)(
    "keeps horizontal flip screen-relative at %s degrees",
    (canvasRotation) => {
      const normal = projectStudioDocumentPointToView({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH: false,
        canvasRotation,
        x: 20,
        y: 30,
      });
      const flipped = projectStudioDocumentPointToView({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH: true,
        canvasRotation,
        x: 20,
        y: 30,
      });

      expect(flipped.x).toBe(normal.viewWidth - normal.x);
      expect(flipped.y).toBe(normal.y);
    }
  );

  it.each([
    [0, false, { x: 10, y: 20, width: 30, height: 40 }],
    [90, false, { x: 140, y: 10, width: 40, height: 30 }],
    [180, false, { x: 60, y: 140, width: 30, height: 40 }],
    [270, false, { x: 20, y: 60, width: 40, height: 30 }],
    [0, true, { x: 60, y: 20, width: 30, height: 40 }],
    [90, true, { x: 20, y: 10, width: 40, height: 30 }],
    [180, true, { x: 10, y: 140, width: 30, height: 40 }],
    [270, true, { x: 140, y: 60, width: 40, height: 30 }],
  ] as const)(
    "round-trips an AABB for rotation=%s flipH=%s",
    (canvasRotation, canvasFlipH, expected) => {
      const projected = projectStudioDocumentRectToViewRect({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH,
        canvasRotation,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      });
      expect(projected).toEqual(expected);
      expect(projectStudioViewRectToDocumentRect({
        documentWidth: 100,
        documentHeight: 200,
        canvasFlipH,
        canvasRotation,
        ...projected,
      })).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    }
  );

  it("keeps scale and the centered document point stable while rotating a long canvas", () => {
    expect(planStudioViewRotationTransition({
      documentWidth: 720,
      documentHeight: 8_000,
      canvasFlipH: false,
      canvasRotation: 0,
      nextCanvasRotation: 90,
      scale: 1,
      scrollLeft: 200,
      scrollTop: 3_000,
      viewportWidth: 300,
      viewportHeight: 300,
    })).toEqual({
      canvasRotation: 90,
      documentPoint: { x: 350, y: 3_150 },
      scrollLeft: 4_700,
      scrollTop: 200,
    });
  });

  it("clamps centered scrolling at transformed view edges", () => {
    expect(planStudioViewScrollToDocumentPoint({
      documentWidth: 100,
      documentHeight: 200,
      canvasFlipH: true,
      canvasRotation: 90,
      scale: 2,
      viewportWidth: 80,
      viewportHeight: 60,
      x: 100,
      y: 200,
    })).toEqual({ scrollLeft: 320, scrollTop: 140 });
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
      canvasWidth: 720,
      canvasHeight: 2_000,
      canvasFlipH: true,
    });

    expect(snapshot.centerX).toBe(320);
    expect(snapshot.centerY).toBeCloseTo(733.333333, 5);
    expect(snapshot.canvasRotation).toBe(0);

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
      canvasRotation: 0,
    });
  });

  it("preserves a rotated view and restores against the swapped visual bounds", () => {
    const snapshot = captureStudioView({
      pageId: "page-1",
      scale: 1,
      zoom: 1,
      scrollLeft: 900,
      scrollTop: 100,
      viewportWidth: 200,
      viewportHeight: 300,
      canvasWidth: 720,
      canvasHeight: 2_000,
      canvasFlipH: true,
      canvasRotation: 450,
    });

    expect(snapshot).toMatchObject({
      centerX: 250,
      centerY: 1_000,
      canvasFlipH: true,
      canvasRotation: 90,
    });

    expect(planStudioViewRestore({
      snapshot,
      pageId: "page-1",
      viewportWidth: 400,
      viewportHeight: 200,
      canvasWidth: 720,
      canvasHeight: 2_000,
    })).toEqual({
      scale: 1,
      zoom: 1,
      scrollLeft: 800,
      scrollTop: 150,
      canvasFlipH: true,
      canvasRotation: 90,
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
      canvasWidth: 720,
      canvasHeight: 1_080,
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
      canvasRotation: 0 as const,
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
