import { describe, expect, it } from "vitest";
import { studioJoystickVector } from "./studio-virtual-space-joystick-input";
import { DEFAULT_STUDIO_MOTION_CONFIG, stepStudioVirtualSpaceMotion } from "./studio-virtual-space-motion";
import { advanceStudioWorldPath, stepStudioWorldCruise, steerStudioWorldCruise } from "./studio-virtual-space-path-steering";
import {
  EMPTY_STUDIO_WORLD_APPROACH,
  EMPTY_STUDIO_WORLD_WALK_OVER,
  stepStudioWorldInteractionApproach,
  stepStudioWorldWalkOver,
  studioWorldArrivalInput,
  studioWorldFloorFocusTarget,
  studioWorldPromptInteractGate,
} from "./studio-virtual-space-runtime-policy";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
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

  it("cruises an open multi-waypoint path until the final approach", () => {
    const finalPoint = { x: 500, y: 210 };
    const openPath = [
      { x: 140, y: 160 },
      { x: 240, y: 200 },
      { x: 360, y: 150 },
      finalPoint,
    ];
    const cleared = steerStudioWorldCruise({
      manifest: openWorld,
      current: { x: 40, y: 120 },
      path: openPath,
      maxSpeed: DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed,
      deceleration: DEFAULT_STUDIO_MOTION_CONFIG.deceleration,
      direct: { x: 1, y: 0 },
    });
    expect(cleared.path).toEqual([]);
    expect(cleared.cleared).toBe(true);

    let point = { x: 40, y: 120 };
    let velocity = { x: 0, y: 0 };
    let path: readonly { x: number; y: number }[] = openPath;
    let sawCruise = false;
    let minCruise = Number.POSITIVE_INFINITY;
    let reversed = false;
    for (let frame = 0; frame < 600; frame += 1) {
      const distance = Math.hypot(finalPoint.x - point.x, finalPoint.y - point.y);
      const stepped = stepStudioWorldCruise({
        manifest: openWorld,
        point,
        velocity,
        path,
        direct: { x: 0, y: 0 },
        deltaSeconds: 1 / 60,
        config: DEFAULT_STUDIO_MOTION_CONFIG,
      });
      const speed = Math.hypot(stepped.velocity.x, stepped.velocity.y);
      if (distance > 16 && speed > DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed / 2) sawCruise = true;
      if (sawCruise && distance > 16) minCruise = Math.min(minCruise, speed);
      if (stepped.point.x > finalPoint.x + 3 || stepped.point.y > finalPoint.y + 3) reversed = true;
      if (stepped.point.x > finalPoint.x + 0.5 && stepped.velocity.x < -1) reversed = true;
      point = stepped.point;
      velocity = stepped.velocity;
      path = stepped.path;
      expect(studioWorldCanOccupy(openWorld, point)).toBe(true);
    }
    expect(sawCruise).toBe(true);
    expect(minCruise).toBeGreaterThan(DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed / 2);
    expect(Math.hypot(finalPoint.x - point.x, finalPoint.y - point.y)).toBeLessThanOrEqual(3);
    expect(velocity).toEqual({ x: 0, y: 0 });
    expect(reversed).toBe(false);
  });

  it("refuses a diagonal shortcut that crosses a collider", () => {
    const corner = { x: 80, y: 220 };
    const far = { x: 240, y: 120 };
    const blocked = {
      ...openWorld,
      colliders: [{ x: 150, y: 100, width: 30, height: 40 }],
    };
    const current = { x: 80, y: 120 };
    const steered = steerStudioWorldCruise({
      manifest: blocked,
      current,
      path: [corner, far],
      maxSpeed: DEFAULT_STUDIO_MOTION_CONFIG.maxSpeed,
      deceleration: DEFAULT_STUDIO_MOTION_CONFIG.deceleration,
      direct: { x: 0, y: 0 },
    });
    expect(steered.path[0]).toEqual(corner);
    expect(steered.path).not.toEqual([far]);

    let point = current;
    let velocity = { x: 0, y: 0 };
    let path: readonly { x: number; y: number }[] = [corner, far];
    for (let frame = 0; frame < 20; frame += 1) {
      const stepped = stepStudioWorldCruise({
        manifest: blocked,
        point,
        velocity,
        path,
        direct: { x: 0, y: 0 },
        deltaSeconds: 1 / 60,
        config: DEFAULT_STUDIO_MOTION_CONFIG,
      });
      expect(studioWorldCanOccupy(blocked, stepped.point)).toBe(true);
      point = stepped.point;
      velocity = stepped.velocity;
      path = stepped.path;
    }
  });
});

describe("Virtual Studio interaction approach", () => {
  const center = { x: 300, y: 200 };
  const radius = 48;
  const target = { id: "desk", point: center, radius };

  it("walks to an occupiable point and activates once on entry", () => {
    let state = EMPTY_STUDIO_WORLD_APPROACH;
    let point = { x: 80, y: 200 };
    let velocity = { x: 0, y: 0 };
    const first = stepStudioWorldInteractionApproach(openWorld, state, point, { selection: target });
    expect(first.activateId).toBeNull();
    expect(first.walkTarget).not.toBeNull();
    expect(studioWorldCanOccupy(openWorld, first.walkTarget!)).toBe(true);
    expect(Math.hypot(first.walkTarget!.x - center.x, first.walkTarget!.y - center.y)).toBeLessThanOrEqual(radius);
    state = first.state;

    let activations = 0;
    for (let frame = 0; frame < 360 && activations === 0; frame += 1) {
      const before = Math.hypot(point.x - center.x, point.y - center.y);
      const walkTarget = state.pending?.walkTarget ?? first.walkTarget!;
      const dx = walkTarget.x - point.x;
      const dy = walkTarget.y - point.y;
      const gap = Math.hypot(dx, dy) || 1;
      const motion = stepStudioVirtualSpaceMotion(
        { velocity },
        gap <= 2 ? { x: 0, y: 0 } : { x: dx / gap, y: dy / gap },
        1 / 60,
        DEFAULT_STUDIO_MOTION_CONFIG,
      );
      velocity = motion.velocity;
      point = { x: point.x + velocity.x / 60, y: point.y + velocity.y / 60 };
      const stepped = stepStudioWorldInteractionApproach(openWorld, state, point, {});
      state = stepped.state;
      const after = Math.hypot(point.x - center.x, point.y - center.y);
      if (before > radius && after > radius) expect(stepped.activateId).toBeNull();
      if (stepped.activateId) activations += 1;
    }
    expect(activations).toBe(1);
    expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeLessThanOrEqual(radius);
    const stillInside = stepStudioWorldInteractionApproach(openWorld, state, point, {});
    expect(stillInside.activateId).toBeNull();
  });

  it("activates an in-range interact immediately without another walk", () => {
    const inside = { x: center.x + 10, y: center.y };
    const pointer = stepStudioWorldInteractionApproach(openWorld, EMPTY_STUDIO_WORLD_APPROACH, inside, { selection: target });
    expect(pointer.activateId).toBe("desk");
    expect(pointer.walkTarget).toBeNull();
    expect(pointer.state.pending).toBeNull();

    const key = stepStudioWorldInteractionApproach(openWorld, EMPTY_STUDIO_WORLD_APPROACH, inside, {
      inRangeInteract: true,
      nearby: target,
    });
    expect(key.activateId).toBe("desk");
    expect(key.walkTarget).toBeNull();
    const again = stepStudioWorldInteractionApproach(openWorld, key.state, inside, {});
    expect(again.activateId).toBeNull();
  });

  it("does not walk or activate when the radius is fully blocked", () => {
    const blocked = {
      ...openWorld,
      colliders: [{ x: center.x - 80, y: center.y - 80, width: 160, height: 160 }],
    };
    const first = stepStudioWorldInteractionApproach(blocked, EMPTY_STUDIO_WORLD_APPROACH, { x: 40, y: 200 }, { selection: target });
    expect(first.walkTarget).toBeNull();
    expect(first.activateId).toBeNull();
    const retry = stepStudioWorldInteractionApproach(blocked, first.state, { x: 40, y: 200 }, {});
    expect(retry.walkTarget).toBeNull();
    expect(retry.activateId).toBeNull();
  });

  it("highlights and prompts only inside a walkable radius, and activates once", () => {
    let state = EMPTY_STUDIO_WORLD_APPROACH;
    let point = { x: 80, y: 200 };
    let velocity = { x: 0, y: 0 };
    const outside = stepStudioWorldInteractionApproach(openWorld, state, point, { selection: target, focus: target });
    expect(outside.highlightId).toBeNull();
    expect(outside.prompt).toBe(false);
    expect(outside.activateId).toBeNull();
    expect(outside.walkTarget).not.toBeNull();
    state = outside.state;

    let activations = 0;
    let sawInside = false;
    for (let frame = 0; frame < 360 && !sawInside; frame += 1) {
      const before = Math.hypot(point.x - center.x, point.y - center.y);
      const walkTarget = state.pending?.walkTarget ?? outside.walkTarget!;
      const dx = walkTarget.x - point.x;
      const dy = walkTarget.y - point.y;
      const gap = Math.hypot(dx, dy) || 1;
      const motion = stepStudioVirtualSpaceMotion(
        { velocity },
        gap <= 2 ? { x: 0, y: 0 } : { x: dx / gap, y: dy / gap },
        1 / 60,
        DEFAULT_STUDIO_MOTION_CONFIG,
      );
      velocity = motion.velocity;
      point = { x: point.x + velocity.x / 60, y: point.y + velocity.y / 60 };
      const stepped = stepStudioWorldInteractionApproach(openWorld, state, point, { focus: target });
      state = stepped.state;
      const after = Math.hypot(point.x - center.x, point.y - center.y);
      if (after > radius) {
        expect(stepped.highlightId).toBeNull();
        expect(stepped.prompt).toBe(false);
        expect(stepped.activateId).toBeNull();
      }
      if (before > radius && after <= radius) {
        expect(stepped.highlightId).toBe("desk");
        expect(stepped.prompt).toBe(true);
        expect(stepped.activateId).toBe("desk");
        activations += 1;
        sawInside = true;
      }
    }
    expect(activations).toBe(1);
    const still = stepStudioWorldInteractionApproach(openWorld, state, point, { focus: target });
    expect(still.activateId).toBeNull();
    expect(still.highlightId).toBe("desk");
    expect(still.prompt).toBe(true);

    const left = stepStudioWorldInteractionApproach(openWorld, still.state, { x: 80, y: 200 }, { focus: target });
    expect(left.highlightId).toBeNull();
    expect(left.prompt).toBe(false);
    expect(left.activateId).toBeNull();

    const inside = { x: center.x + 10, y: center.y };
    const key = stepStudioWorldInteractionApproach(openWorld, EMPTY_STUDIO_WORLD_APPROACH, inside, {
      inRangeInteract: true,
      nearby: target,
      focus: target,
    });
    expect(key.activateId).toBe("desk");
    expect(key.walkTarget).toBeNull();
    expect(key.highlightId).toBe("desk");
    expect(key.prompt).toBe(true);
    const again = stepStudioWorldInteractionApproach(openWorld, key.state, inside, { focus: target, nearby: target });
    expect(again.activateId).toBeNull();
    expect(again.prompt).toBe(true);

    const blocked = {
      ...openWorld,
      colliders: [{ x: center.x - 80, y: center.y - 80, width: 160, height: 160 }],
    };
    const sealed = stepStudioWorldInteractionApproach(blocked, EMPTY_STUDIO_WORLD_APPROACH, { x: 40, y: 200 }, {
      selection: target,
      focus: target,
    });
    expect(sealed.walkTarget).toBeNull();
    expect(sealed.highlightId).toBeNull();
    expect(sealed.prompt).toBe(false);
    expect(sealed.activateId).toBeNull();
  });

  it("keeps the interaction prompt when an NPC is nearby and accepts a focused prompt click", () => {
    const inside = { x: center.x + 10, y: center.y };
    const focus = studioWorldFloorFocusTarget({ npcNearby: true, interaction: target });
    expect(focus).toEqual(target);
    const highlighted = stepStudioWorldInteractionApproach(openWorld, EMPTY_STUDIO_WORLD_APPROACH, inside, {
      focus,
      nearby: focus,
    });
    expect(highlighted.highlightId).toBe("desk");
    expect(highlighted.prompt).toBe(true);
    expect(highlighted.activateId).toBeNull();

    const promptClick = studioWorldPromptInteractGate({
      requested: true,
      canvasFocused: false,
      promptFocused: true,
      blocked: false,
    });
    expect(promptClick).toBe(true);
    const activated = stepStudioWorldInteractionApproach(openWorld, EMPTY_STUDIO_WORLD_APPROACH, inside, {
      focus,
      nearby: focus,
      inRangeInteract: promptClick,
    });
    expect(activated.activateId).toBe("desk");
    expect(activated.walkTarget).toBeNull();
    const again = stepStudioWorldInteractionApproach(openWorld, activated.state, inside, { focus, nearby: focus });
    expect(again.activateId).toBeNull();
    expect(again.prompt).toBe(true);

    expect(studioWorldPromptInteractGate({
      requested: true,
      canvasFocused: false,
      promptFocused: false,
      blocked: false,
    })).toBe(false);
    expect(studioWorldFloorFocusTarget({ npcNearby: true, interaction: null })).toBeNull();
  });
});

describe("Virtual Studio walk-over", () => {
  it("follows a moving person beside them, then drops the route when steered", () => {
    const person = { id: "bob", point: { x: 320, y: 200 } };
    const start = { x: 80, y: 200 };
    const first = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, start, { choice: person });
    expect(first.follow).toBe(true);
    expect(first.routeTarget).not.toBeNull();
    expect(studioWorldCanOccupy(openWorld, first.routeTarget!)).toBe(true);
    expect(Math.hypot(first.routeTarget!.x - person.point.x, first.routeTarget!.y - person.point.y)).toBeGreaterThan(20);
    expect(Math.hypot(first.routeTarget!.x - person.point.x, first.routeTarget!.y - person.point.y)).toBeLessThanOrEqual(40);

    const movedPerson = { id: "bob", point: { x: 420, y: 260 } };
    const followed = stepStudioWorldWalkOver(openWorld, first.state, start, { followTarget: movedPerson });
    expect(followed.follow).toBe(true);
    expect(followed.routeTarget).not.toBeNull();
    expect(studioWorldCanOccupy(openWorld, followed.routeTarget!)).toBe(true);
    expect(Math.hypot(followed.routeTarget!.x - movedPerson.point.x, followed.routeTarget!.y - movedPerson.point.y)).toBeLessThanOrEqual(40);
    expect(followed.routeTarget).not.toEqual(first.routeTarget);

    const steered = stepStudioWorldWalkOver(openWorld, followed.state, start, { followTarget: movedPerson, direct: true });
    expect(steered.follow).toBe(false);
    expect(steered.routeTarget).toBeNull();
    expect(steered.state.routeTarget).toBeNull();

    const beside = { x: person.point.x + 30, y: person.point.y };
    const already = stepStudioWorldWalkOver(openWorld, EMPTY_STUDIO_WORLD_WALK_OVER, beside, { choice: person });
    expect(already.routeTarget).toBeNull();
    expect(already.follow).toBe(true);
  });
});
