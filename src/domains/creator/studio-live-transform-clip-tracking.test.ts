import { describe, expect, it } from "vitest";

import {
  studioLiveTransformClipChanged,
  studioLiveTransformCommittedClip,
  studioLiveTransformTargetBounds,
} from "./studio-live-transform-clip-tracking";

import type { El } from "./studio-element-model";

/** One 200x200 panel at the origin, the shape `containingPanel` reads. */
const PANEL = {
  id: "frame-1",
  type: "frame",
  x: 0,
  y: 0,
  width: 200,
  height: 200,
} as unknown as El;

const ELEMENTS: readonly El[] = [PANEL];

describe("studioLiveTransformTargetBounds", () => {
  it("returns the target box unchanged when nothing is rotated", () => {
    expect(
      studioLiveTransformTargetBounds({ x: 10, y: 20, width: 30, height: 40 }, 0),
    ).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it("grows the box to the rotated AABB, about the box's own centre", () => {
    // containingPanel reads elBounds, which is axis-aligned, so a rotated stroke's verdict is
    // decided by the box AROUND the rotated ink. A 100x100 square at 45 degrees spans 141.4.
    const rotated = studioLiveTransformTargetBounds(
      { x: 0, y: 0, width: 100, height: 100 },
      45,
    );

    expect(rotated?.w).toBeCloseTo(141.421, 3);
    expect(rotated?.h).toBeCloseTo(141.421, 3);
    // Centre preserved: the decomposition rotates about the target box's centre.
    expect((rotated!.x + rotated!.w / 2)).toBeCloseTo(50, 6);
    expect((rotated!.y + rotated!.h / 2)).toBeCloseTo(50, 6);
  });

  it("refuses a degenerate or non-finite frame rather than guessing", () => {
    expect(studioLiveTransformTargetBounds({ x: 0, y: 0, width: 0, height: 10 }, 0)).toBeNull();
    expect(studioLiveTransformTargetBounds({ x: 0, y: 0, width: 10, height: 10 }, Number.NaN))
      .toBeNull();
  });
});

describe("studioLiveTransformCommittedClip", () => {
  it("clips a stroke whose transformed centre lands inside the panel", () => {
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 40, y: 40, width: 40, height: 40 },
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it("drops the clip when the transform carries the centre OUT of the panel", () => {
    // The crossing this whole module exists for: the source stroke was clipped, the target is not.
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 400, y: 400, width: 40, height: 40 },
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).toBeNull();
  });

  it("adds the clip when the transform carries an unclipped stroke INTO a panel", () => {
    // The inverse crossing, which the source render has no clip group for at all.
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 80, y: 80, width: 20, height: 20 },
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it("drops the clip when a scale pushes the stroke past the 1.4x size cutoff", () => {
    // Centre still inside, but too big to be considered panel content — the same rule
    // containingPanel applies, reached by growing rather than by moving.
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 0, y: 0, width: 281, height: 100 },
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).toBeNull();
    // Just inside the cutoff, it still clips.
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 0, y: 0, width: 279, height: 100 },
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).not.toBeNull();
  });

  it("lets a ROTATION alone cross the cutoff, because the verdict reads the AABB", () => {
    // The panel is 200x200, so the cutoff is 280 on each side. A 280x180 box centred in the panel
    // sits just inside it upright; turned 45 degrees its AABB is 325.3 on BOTH sides, which the
    // commit reads as "too big to be panel content" and un-clips. Rotation alone, no scaling.
    const box = { x: -40, y: 10, width: 280, height: 180 } as const;

    expect(
      studioLiveTransformCommittedClip({
        targetBounds: box,
        rotationDeg: 0,
        elements: ELEMENTS,
      }),
    ).not.toBeNull();
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: box,
        rotationDeg: 45,
        elements: ELEMENTS,
      }),
    ).toBeNull();
  });

  it("honours the element's own noClip flag, as the document layer does", () => {
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 40, y: 40, width: 40, height: 40 },
        rotationDeg: 0,
        elements: ELEMENTS,
        noClip: true,
      }),
    ).toBeNull();
  });

  it("ignores hidden panels, as containingPanel does", () => {
    expect(
      studioLiveTransformCommittedClip({
        targetBounds: { x: 40, y: 40, width: 40, height: 40 },
        rotationDeg: 0,
        elements: [{ ...(PANEL as object), hidden: true } as unknown as El],
      }),
    ).toBeNull();
  });
});

describe("studioLiveTransformClipChanged", () => {
  it("reports a change only when the verdict actually moves", () => {
    const rect = { x: 0, y: 0, width: 200, height: 200 };
    expect(studioLiveTransformClipChanged(rect, { ...rect })).toBe(false);
    expect(studioLiveTransformClipChanged(null, null)).toBe(false);
    expect(studioLiveTransformClipChanged(rect, null)).toBe(true);
    expect(studioLiveTransformClipChanged(null, rect)).toBe(true);
    expect(studioLiveTransformClipChanged(rect, { ...rect, width: 199 })).toBe(true);
  });
});
