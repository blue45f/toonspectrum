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

describe("Studio VRM grip contact targets", () => {
  it("distributes four fingers along the handle instead of collapsing onto one point", () => {
    const result = createStudioVrmGripContactTargets({
      center: new THREE.Vector3(0, 0, 0),
      axis: new THREE.Vector3(0, 1, 0),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      fingertipWorldPositions: points(),
      gripRadius: 0.008,
      handSize: 0.075,
      side: "right",
    });

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

  it("uses the nearest circumferential side from the authored hand pose", () => {
    const input = points();
    input[0]!.x = -0.03;
    const result = createStudioVrmGripContactTargets({
      center: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      fingertipWorldPositions: input,
      gripRadius: 0.01,
      handSize: 0.08,
      side: "right",
    });

    expect(result?.targets[0]?.x).toBeLessThan(0);
    expect(result?.targets[1]?.x).toBeGreaterThan(0);
  });

  it("returns a small physical contact tolerance rather than a hand-sized center distance", () => {
    const result = createStudioVrmGripContactTargets({
      center: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      fingertipWorldPositions: points(),
      gripRadius: 0.008,
      handSize: 0.075,
      side: "right",
    });

    expect(result!.tolerance).toBeGreaterThanOrEqual(0.002);
    expect(result!.tolerance).toBeLessThanOrEqual(0.009);
    expect(result!.tolerance).toBeLessThan(0.075 * 0.2);
  });

  it("fails closed for malformed grip metrics", () => {
    expect(createStudioVrmGripContactTargets({
      center: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 0, 0),
      fallbackRadial: new THREE.Vector3(1, 0, 0),
      fingertipWorldPositions: points().slice(0, 3),
      gripRadius: Number.NaN,
      handSize: 0.075,
      side: "left",
    })).toBeNull();
  });
});
