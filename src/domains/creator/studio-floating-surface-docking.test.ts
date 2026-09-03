import { describe, expect, it } from "vitest";

import {
  createStudioFloatingSurfaceLayout,
  encodeStudioFloatingSurfaceLayout,
  resolveStudioFloatingSurfaceDockCandidate,
  resolveStudioFloatingSurfaceDockRect,
  resolveStudioFloatingSurfaceRect,
  resizeStudioFloatingSurfaceRectFromEdge,
  snapStudioFloatingSurfaceRectToPeers,
  undockStudioFloatingSurfaceRect,
  type StudioFloatingSurfaceConstraints,
} from "./studio-floating-surface";

const VIEWPORT = {
  width: 1_200,
  height: 900,
  insetTop: 76,
  insetRight: 12,
  insetBottom: 12,
  insetLeft: 12,
} as const;

const CONSTRAINTS: StudioFloatingSurfaceConstraints = {
  minWidth: 280,
  minHeight: 240,
  maxWidth: 800,
  maxHeight: 760,
  snapDistance: 12,
};

describe("studio floating surface docking", () => {
  it("persists an optional exact dock edge without changing legacy floating shapes", () => {
    const docked = createStudioFloatingSurfaceLayout(
      { x: 700, y: 160, width: 420, height: 500 },
      VIEWPORT,
      CONSTRAINTS,
      "right",
    );
    expect(docked.dock).toBe("right");
    expect(JSON.parse(encodeStudioFloatingSurfaceLayout(docked))).toEqual({
      version: 1,
      xRatio: docked.xRatio,
      yRatio: docked.yRatio,
      width: 420,
      height: 500,
      dock: "right",
    });

    const floating = createStudioFloatingSurfaceLayout(
      { x: 700, y: 160, width: 420, height: 500 },
      VIEWPORT,
      CONSTRAINTS,
    );
    expect(Object.keys(floating)).not.toContain("dock");
  });

  it("fills the safe axis while preserving the dock's adjustable dimension", () => {
    const preferred = { x: 600, y: 200, width: 420, height: 460 };
    expect(resolveStudioFloatingSurfaceDockRect(
      "left",
      preferred,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 12,
      y: 76,
      width: 420,
      height: 812,
    });
    expect(resolveStudioFloatingSurfaceDockRect(
      "right",
      preferred,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 768,
      y: 76,
      width: 420,
      height: 812,
    });
    expect(resolveStudioFloatingSurfaceDockRect(
      "bottom",
      preferred,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 12,
      y: 428,
      width: 1_176,
      height: 460,
    });
  });

  it("restores a docked layout against a changed viewport", () => {
    const layout = {
      version: 1 as const,
      xRatio: 0.7,
      yRatio: 0.2,
      width: 360,
      height: 440,
      dock: "right" as const,
    };
    expect(resolveStudioFloatingSurfaceRect(
      layout,
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 828,
      y: 76,
      width: 360,
      height: 812,
    });
    expect(resolveStudioFloatingSurfaceRect(
      layout,
      { ...VIEWPORT, width: 1_600 },
      CONSTRAINTS,
    )).toEqual({
      x: 1_228,
      y: 76,
      width: 360,
      height: 812,
    });
  });

  it("chooses only the closest allowed edge inside the activation band", () => {
    expect(resolveStudioFloatingSurfaceDockCandidate(
      { x: 16, y: 100, width: 300, height: 400 },
      VIEWPORT,
      ["left", "right", "bottom"],
      44,
    )).toBe("left");
    expect(resolveStudioFloatingSurfaceDockCandidate(
      { x: 800, y: 470, width: 330, height: 410 },
      VIEWPORT,
      ["right", "bottom"],
      44,
    )).toBe("bottom");
    expect(resolveStudioFloatingSurfaceDockCandidate(
      { x: 500, y: 200, width: 300, height: 400 },
      VIEWPORT,
      ["left", "right", "bottom"],
      44,
    )).toBeNull();
  });

  it("magnetically aligns with peer edges without leaving the safe viewport", () => {
    expect(snapStudioFloatingSurfaceRectToPeers(
      { x: 405, y: 205, width: 300, height: 300 },
      [{ x: 100, y: 200, width: 300, height: 300 }],
      VIEWPORT,
      CONSTRAINTS,
      10,
    )).toEqual({
      x: 400,
      y: 200,
      width: 300,
      height: 300,
    });
  });

  it("undocks beneath the pointer with the remembered floating size", () => {
    const layout = {
      version: 1 as const,
      xRatio: 0.75,
      yRatio: 0.25,
      width: 360,
      height: 440,
      dock: "right" as const,
    };
    const docked = resolveStudioFloatingSurfaceRect(
      layout,
      VIEWPORT,
      CONSTRAINTS,
    );
    const floating = undockStudioFloatingSurfaceRect(
      layout,
      docked,
      1_000,
      96,
      VIEWPORT,
      CONSTRAINTS,
    );
    expect(floating.width).toBe(360);
    expect(floating.height).toBe(440);
    expect(floating.x).toBeGreaterThanOrEqual(VIEWPORT.insetLeft);
    expect(floating.y).toBe(VIEWPORT.insetTop);
  });
  it("resizes from every edge while anchoring the opposite edges", () => {
    const start = { x: 400, y: 240, width: 360, height: 420 };
    expect(resizeStudioFloatingSurfaceRectFromEdge(
      start,
      -40,
      -30,
      "nw",
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 360,
      y: 210,
      width: 400,
      height: 450,
    });
    expect(resizeStudioFloatingSurfaceRectFromEdge(
      start,
      50,
      60,
      "se",
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 400,
      y: 240,
      width: 410,
      height: 480,
    });
    expect(resizeStudioFloatingSurfaceRectFromEdge(
      start,
      1_000,
      0,
      "w",
      VIEWPORT,
      CONSTRAINTS,
    )).toEqual({
      x: 480,
      y: 240,
      width: 280,
      height: 420,
    });
  });

});
