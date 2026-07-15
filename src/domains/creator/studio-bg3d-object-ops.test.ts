import { describe, expect, it } from "vitest";

import {
  applyStudioBg3dSnapToTransform,
  filterStudioBg3dLayerItems,
  groundModelTransform,
  groundPrimitiveTransform,
  isBgObjectLocked,
  isBgObjectTransformBlocked,
  isBgObjectVisible,
  localHalfExtentsForPrimitiveKind,
  normalizeStudioBg3dObjectFlags,
  normalizeStudioBg3dSnapSettings,
  snapEulerRadians,
  snapScalar,
  snapVec3,
  studioBg3dSnapSettingsSummary,
  worldAabbHalfExtents,
} from "./studio-bg3d-object-ops";

describe("studio-bg3d-object-ops", () => {
  it("snaps scalars and vectors to step grids", () => {
    expect(snapScalar(0.24, 0.25)).toBeCloseTo(0.25);
    expect(snapScalar(0.12, 0)).toBe(0.12);
    expect(snapVec3([0.24, 0.51, -0.49], 0.25)).toEqual([0.25, 0.5, -0.5]);
    expect(snapVec3([0.24, 0.51, -0.49], 0.25, "xz")).toEqual([0.25, 0.51, -0.5]);
  });

  it("snaps euler rotations by degree steps", () => {
    const step15 = (15 * Math.PI) / 180;
    const result = snapEulerRadians([step15 * 0.4, step15 * 1.6, 0], 15);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(step15 * 2);
  });

  it("grounds an unrotated unit box on y=0", () => {
    const position = groundPrimitiveTransform(
      "box",
      [1, 3, -2],
      [0, 0, 0],
      [1, 1, 1]
    );
    expect(position[0]).toBe(1);
    expect(position[1]).toBeCloseTo(0.5);
    expect(position[2]).toBe(-2);
  });

  it("grounds a tall scaled box higher", () => {
    const position = groundPrimitiveTransform("box", [0, 0, 0], [0, 0, 0], [1, 4, 1]);
    expect(position[1]).toBeCloseTo(2);
  });

  it("grounds custom models from full bounding size", () => {
    const position = groundModelTransform([2, 4, 2], [0, 10, 0], [0, 0, 0], [1, 1, 1]);
    expect(position[1]).toBeCloseTo(2);
  });

  it("world AABB half extents grow under 45° yaw for a square footprint", () => {
    const upright = worldAabbHalfExtents([1, 1, 1], [0, 0, 0], [1, 1, 1]);
    const yaw45 = worldAabbHalfExtents([1, 1, 1], [0, Math.PI / 4, 0], [1, 1, 1]);
    expect(yaw45[0]).toBeGreaterThan(upright[0]);
    expect(yaw45[2]).toBeGreaterThan(upright[2]);
  });

  it("normalizes flags and transform blocks", () => {
    expect(normalizeStudioBg3dObjectFlags({})).toEqual({ visible: true, locked: false });
    expect(normalizeStudioBg3dObjectFlags({ visible: false, locked: true })).toEqual({
      visible: false,
      locked: true,
    });
    expect(isBgObjectVisible({ visible: false })).toBe(false);
    expect(isBgObjectLocked({ locked: true })).toBe(true);
    expect(isBgObjectTransformBlocked({ locked: true })).toBe(true);
    expect(isBgObjectTransformBlocked({ visible: false })).toBe(false);
  });

  it("filters layer list by query", () => {
    const items = [
      { id: "a", label: "상자 1", kind: "primitive" as const, visible: true, locked: false },
      { id: "b", label: "학교 책상", kind: "model" as const, visible: true, locked: true },
    ];
    expect(filterStudioBg3dLayerItems(items, "책상").map((x) => x.id)).toEqual(["b"]);
    expect(filterStudioBg3dLayerItems(items, "").length).toBe(2);
  });

  it("summarizes snap settings", () => {
    expect(studioBg3dSnapSettingsSummary({ ...normalizeStudioBg3dSnapSettings({}), enabled: false })).toBe(
      "스냅 끔"
    );
    expect(
      studioBg3dSnapSettingsSummary({
        enabled: true,
        translateStep: 0.25,
        rotateStepDegrees: 15,
        translateAxes: "xz",
      })
    ).toContain("XZ");
  });

  it("applies combined transform snap only when enabled", () => {
    const off = applyStudioBg3dSnapToTransform(
      { position: [0.24, 0.5, 0.26], rotation: [0.1, 0.2, 0.3] },
      normalizeStudioBg3dSnapSettings({ enabled: false })
    );
    expect(off.position[0]).toBeCloseTo(0.24);
    const on = applyStudioBg3dSnapToTransform(
      { position: [0.24, 0.5, 0.26], rotation: [0, 0, 0] },
      {
        enabled: true,
        translateStep: 0.25,
        rotateStepDegrees: 15,
        translateAxes: "xyz",
      }
    );
    expect(on.position[0]).toBeCloseTo(0.25);
    expect(on.position[2]).toBeCloseTo(0.25);
  });

  it("exposes half extents for every known primitive kind", () => {
    const kinds = [
      "box",
      "cylinder",
      "plane",
      "sphere",
      "hemisphere",
      "cone",
      "pyramid",
      "triangularPrism",
      "hexPrism",
      "torus",
      "tube",
      "ring",
      "capsule",
    ] as const;
    for (const kind of kinds) {
      const half = localHalfExtentsForPrimitiveKind(kind);
      expect(half.every((n) => n > 0)).toBe(true);
    }
  });
});
