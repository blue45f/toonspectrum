import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createStudioVrmGripContactTargets } from "./studio-vrm-grip-contact-targets";

function points() {
  return [
    new THREE.Vector3(0.03, 0.03, 0.02),
    new THREE.Vector3(0.031, 0.01, 0.021),
    new THREE.Vector3(0.029, -0.01, 0.019),
    new THREE.Vector3(0.028, -0.03, 0.018),
  ];
}

function plan(
  fingertipWorldPositions = points(),
  fingerIndices: readonly number[] = [0, 1, 2, 3],
) {
  return createStudioVrmGripContactTargets({
    center: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 1, 0),
    fallbackRadial: new THREE.Vector3(1, 0, 0),
    fingertipWorldPositions,
    fingerIndices,
    gripRadius: 0.008,
    handSize: 0.075,
    side: "right",
  });
}

describe("Studio VRM grip contact targets", () => {
  it("distributes four fingers along the handle instead of collapsing onto one point", () => {
    const result = plan();

    expect(result).not.toBeNull();
    const ys = result!.targets.map((target) => target.y);
    expect(new Set(ys.map((value) => value.toFixed(6))).size).toBe(4);
    expect(ys[0]).toBeGreaterThan(ys[1]!);
    expect(ys[1]).toBeGreaterThan(ys[2]!);
    expect(ys[2]).toBeGreaterThan(ys[3]!);
    for (const target of result!.targets) {
      expect(Math.hypot(target.x, target.z)).toBeCloseTo(result!.surfaceRadius, 6);
    }
  });

  it("keeps anatomical slots when a locked finger is omitted", () => {
    const all = points();
    const result = plan([all[0]!, all[2]!, all[3]!], [0, 2, 3]);

    expect(result).not.toBeNull();
    expect(result!.targets).toHaveLength(3);
    expect(result!.targets[0]!.y).toBeGreaterThan(result!.targets[1]!.y);
    expect(result!.targets[1]!.y).toBeGreaterThan(result!.targets[2]!.y);
    // Ring keeps the ring slot; it is not shifted into the missing middle-finger slot.
    expect(result!.targets[1]!.y).toBeLessThan(0);
  });

  it("uses the nearest circumferential side from the authored hand pose", () => {
    const input = points();
    input[0]!.x = -0.03;
    const result = plan(input);

    expect(result?.targets[0]?.x).toBeLessThan(0);
    expect(result?.targets[1]?.x).toBeGreaterThan(0);
  });

  it("returns a small physical contact tolerance rather than a hand-sized center distance", () => {
    const result = plan();

    expect(result!.tolerance).toBeGreaterThanOrEqual(0.002);
    expect(result!.tolerance).toBeLessThanOrEqual(0.009);
    expect(result!.tolerance).toBeLessThan(0.075 * 0.2);
  });

  it("fails closed for malformed grip metrics and finger mappings", () => {
    expect(createStudioVrmGripContactTargets({
      center: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 0, 0),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      fingertipWorldPositions: points().slice(0, 3),
      fingerIndices: [0, 1, 2],
      gripRadius: Number.NaN,
      handSize: 0.075,
      side: "left",
    })).toBeNull();

    expect(plan(points().slice(0, 2), [0, 0])).toBeNull();
    expect(plan(points().slice(0, 2), [0, 4])).toBeNull();
    expect(plan(points().slice(0, 2), [0])).toBeNull();
  });
});
