import { describe, expect, it } from "vitest";

import { createBrushStudioV6MotionFilter } from "./brush-studio-v6-motion-runtime";

const point = (x: number, y = 0) => ({
  x, y, pressure: 0.6, tilt: 0.2, twist: 12,
});

function filter(motionId: string, stabilization = 0.7) {
  return createBrushStudioV6MotionFilter({
    motionId,
    stabilization,
    size: 24,
    friction: 0.5,
  });
}

describe("Brush Studio V6 motion runtime", () => {
  it("keeps direct input byte-for-byte at the contact boundary", () => {
    const runtime = filter("motion-direct");
    expect(runtime.push(point(4, 7))).toEqual(point(4, 7));
    expect(runtime.push(point(20, 11))).toEqual(point(20, 11));
  });

  it.each(["motion-adaptive-ema", "motion-spring", "motion-brush-inertia"])(
    "%s follows the selected input without impersonating direct motion",
    (motionId) => {
      const runtime = filter(motionId);
      runtime.push(point(0));
      const result = runtime.push(point(24));
      expect(result.x).toBeGreaterThan(0);
      expect(result.x).toBeLessThan(24);
    },
  );

  it("holds a lazy leash until the pointer leaves its radius", () => {
    const runtime = filter("motion-lazy-leash", 1);
    expect(runtime.push(point(0)).x).toBe(0);
    expect(runtime.push(point(10)).x).toBe(0);
    expect(runtime.push(point(40)).x).toBeGreaterThan(0);
    expect(runtime.push(point(40)).x).toBeLessThan(40);
  });

  it("is deterministic and reset returns the same first trajectory", () => {
    const runtime = filter("motion-spring", 0.55);
    const samples = [point(0), point(12, 3), point(25, -2), point(41, 5)];
    const first = samples.map((sample) => runtime.push(sample));
    runtime.reset();
    const second = samples.map((sample) => runtime.push(sample));
    expect(second).toEqual(first);
  });

  it("preserves calibrated pressure, tilt and twist while moving geometry", () => {
    const runtime = filter("motion-adaptive-ema");
    runtime.push(point(0));
    const result = runtime.push({ x: 30, y: 8, pressure: 0.9, tilt: 0.7, twist: 270 });
    expect(result).toMatchObject({ pressure: 0.9, tilt: 0.7, twist: 270 });
  });
});
