import { describe, expect, it, vi } from "vitest";

import {
  strokeStudioDashedRect,
  studioPrivateZoneOverlayShapes,
  type StudioDashedRectGraphics,
} from "./studio-virtual-space-private-zone-overlay";
import type { StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";

function zone(partial: Partial<StudioWorldAcousticZoneDefinition>): StudioWorldAcousticZoneDefinition {
  return {
    id: "zone-1",
    roomId: "room-1",
    x: 10,
    y: 20,
    width: 100,
    height: 60,
    policy: "private",
    ...partial,
  } as StudioWorldAcousticZoneDefinition;
}

describe("studioPrivateZoneOverlayShapes", () => {
  it("returns only private zones", () => {
    const shapes = studioPrivateZoneOverlayShapes([
      zone({ id: "private-1", policy: "private", doorId: "door-1" }),
      zone({ id: "public-1", policy: "public" }),
    ]);
    expect(shapes.map((shape) => shape.id)).toEqual(["private-1"]);
    expect(shapes[0]?.hasDoor).toBe(true);
  });

  it("marks zones without doors", () => {
    const shapes = studioPrivateZoneOverlayShapes([zone({ id: "private-2" })]);
    expect(shapes[0]?.hasDoor).toBe(false);
  });

  it("returns empty for missing zones", () => {
    expect(studioPrivateZoneOverlayShapes(undefined)).toEqual([]);
  });
});

describe("strokeStudioDashedRect", () => {
  function recorder(): StudioDashedRectGraphics & { calls: Array<[number, number, number, number]> } {
    const calls: Array<[number, number, number, number]> = [];
    return {
      calls,
      lineStyle: vi.fn(),
      lineBetween: (x1: number, y1: number, x2: number, y2: number) => {
        calls.push([x1, y1, x2, y2]);
      },
    };
  }

  it("draws dashed segments along each edge", () => {
    const graphics = recorder();
    strokeStudioDashedRect(graphics, { x: 0, y: 0, width: 30, height: 20 }, 10, 6);
    // top edge (30 wide): segments [0,10] and [16,26]
    expect(graphics.calls).toContainEqual([0, 0, 10, 0]);
    expect(graphics.calls).toContainEqual([16, 0, 26, 0]);
    // right edge (20 tall): segments [0,10] and [16,20(clamped)]
    expect(graphics.calls).toContainEqual([30, 0, 30, 10]);
    expect(graphics.calls).toContainEqual([30, 16, 30, 20]);
    // every segment lies on the rectangle border
    for (const [x1, y1, x2, y2] of graphics.calls) {
      const onBorder =
        (y1 === 0 && y2 === 0) || (x1 === 30 && x2 === 30) || (y1 === 20 && y2 === 20) || (x1 === 0 && x2 === 0);
      expect(onBorder).toBe(true);
    }
  });

  it("skips degenerate rects", () => {
    const graphics = recorder();
    strokeStudioDashedRect(graphics, { x: 5, y: 5, width: 0, height: 0 });
    expect(graphics.calls).toEqual([]);
  });
});
