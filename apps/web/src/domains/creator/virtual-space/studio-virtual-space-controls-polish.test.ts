import { describe, expect, it } from "vitest";
import { studioJoystickVector } from "./studio-virtual-space-joystick-input";
import { advanceStudioWorldPath } from "./studio-virtual-space-path-steering";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { studioWorldArrivalInput } from "./studio-virtual-space-runtime-policy";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const openWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 600, height: 600, props: [], colliders: [] };
describe("Virtual Studio control polish", () => {
  it("keeps the touch centre still and preserves partial analog speed", () => {
    expect(studioJoystickVector(.02, -.03)).toEqual({ x: 0, y: 0 });
    expect(studioJoystickVector(.54, 0).x).toBeCloseTo(.5);
    const diagonal = studioJoystickVector(2, 2);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(studioJoystickVector(NaN, 0)).toEqual({ x: 0, y: 0 });
  });
  it("looks through a nearby waypoint with clear floor", () => {
    const path = [{ x: 110, y: 100 }, { x: 200, y: 100 }];
    expect(advanceStudioWorldPath(openWorld, { x: 100, y: 100 }, path, 205)).toEqual([path[1]]);
  });
  it("does not cut diagonally through the inside of a desk", () => {
    const world = { ...openWorld, colliders: [{ x: 113, y: 102, width: 8, height: 10 }] };
    const path = [{ x: 100, y: 90 }, { x: 140, y: 110 }];
    expect(advanceStudioWorldPath(world, { x: 100, y: 100 }, path, 205)).toBe(path);
  });
  it("does not skip a distant waypoint or a final arrival", () => {
    const path = [{ x: 110, y: 100 }, { x: 200, y: 100 }];
    expect(advanceStudioWorldPath(openWorld, { x: 60, y: 100 }, path, 205)).toBe(path);
    expect(advanceStudioWorldPath(openWorld, { x: 100, y: 100 }, [path[0]!], 205)).toEqual([path[0]]);
  });
  it("brakes decisively before reversing rather than sliding backward", () => {
    const result = stepStudioVirtualSpaceMotion({ velocity: { x: 205, y: 0 } }, { x: -1, y: 0 }, 1 / 60);
    expect(result.velocity.x).toBe(170);
  });
  it.each([30, 60, 120])("brakes a sprint path against its effective max speed at %i Hz", (fps) => {
    const target = { x: 180, y: 0 };
    const config = { ...DEFAULT_STUDIO_MOTION_CONFIG, maxSpeed: DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed * 1.35 };
    let point = { x: 0, y: 0 };
    let state = { velocity: { x: 0, y: 0 } };
    let active = true;
    for (let frame = 0; frame < fps * 4; frame += 1) {
      if (active && Math.hypot(target.x - point.x, target.y - point.y) <= 3) active = false;
      const input = active
        ? studioWorldArrivalInput(point, target, config.maxSpeed, config.deceleration)
        : { x: 0, y: 0 };
      state = stepStudioVirtualSpaceMotion(state, input, 1 / fps, config);
      point = { x: point.x + state.velocity.x / fps, y: point.y + state.velocity.y / fps };
    }
    expect(Math.abs(point.x - target.x)).toBeLessThanOrEqual(3);
    expect(state.velocity.x).toBe(0);
  });
  it("does not propagate non-finite tuning into the physics body", () => {
    const result = stepStudioVirtualSpaceMotion({ velocity: { x: NaN, y: Infinity } }, { x: 1, y: 0 }, 1 / 60,
      { maxSpeed: NaN, acceleration: NaN, deceleration: Infinity });
    expect(result.velocity).toEqual({ x: 0, y: 0 });
    expect(studioWorldArrivalInput({ x: 0, y: 0 }, { x: 100, y: 0 }, 205, -1)).toEqual({ x: 0, y: 0 });
  });
});
