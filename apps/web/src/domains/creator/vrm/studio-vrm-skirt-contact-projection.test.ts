import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { projectStudioVrmSkirtFinalContacts } from "./studio-vrm-skirt-contact-projection";

const sphere = (x: number, radius: number) => ({
  restHead: [x, 0, 0] as const, restTail: [x, 0, 0] as const,
  currentHead: [x, 0, 0] as const, currentTail: [x, 0, 0] as const, radius,
});

describe("final skirt contact correction", () => {
  it("clears overlapping contacts while keeping the waistband byte-identical", () => {
    const positions = new Float32Array([0, 0, 0, 0.02, 0.025, 0]);
    const capsules = [sphere(-0.03, 0.1), sphere(0.03, 0.1)];
    const receipt = projectStudioVrmSkirtFinalContacts(positions, 1, new Float32Array([0.005, 0.005]), capsules);
    expect([...positions.slice(0, 3)]).toEqual([0, 0, 0]);
    for (const capsule of capsules) {
      const distance = Math.hypot(positions[3] - capsule.currentHead[0], positions[4], positions[5]);
      expect(distance).toBeGreaterThanOrEqual(0.105 - 0.0001);
    }
    expect(receipt.passes).toBeLessThanOrEqual(24);
    expect(receipt.maxDisplacementM).toBeGreaterThan(0);
    expect(receipt.maxPenetrationM).toBeLessThanOrEqual(0.00001);
  });

  it.each([0, 1e-7, 0.001])("escapes the parallel-thigh overlap without normal-projection ping-pong (z=%s)", (z) => {
    const capsules = [-0.08, 0.08].map((x) => ({
      restHead: [x, 0, 0] as const, restTail: [x, 1, 0] as const,
      currentHead: [x, 0, 0] as const, currentTail: [x, 1, 0] as const, radius: 0.1,
    }));
    const positions = new Float32Array([0, 0.5, 0, 0, 0.5, z]);
    const repeat = positions.slice();
    const radii = new Float32Array([0.005, 0.005]);
    const before = positions.slice(0, 3);
    const receipt = projectStudioVrmSkirtFinalContacts(positions, 1, radii, capsules);
    expect(positions.slice(0, 3)).toEqual(before);
    expect(receipt.passes).toBeLessThanOrEqual(24);
    expect(receipt.maxDisplacementM).toBeLessThan(0.069); // lens boundary, not a jump across a whole thigh
    const measured = Math.max(0, ...capsules.map((capsule) =>
      capsule.radius + radii[1] - Math.hypot(positions[3] - capsule.currentHead[0], positions[5])));
    expect(measured).toBeLessThanOrEqual(0.00001);
    expect(receipt.maxPenetrationM).toBeCloseTo(measured, 10);
    expect(projectStudioVrmSkirtFinalContacts(repeat, 1, radii, capsules)).toEqual(receipt);
    expect(repeat).toEqual(positions);
  });

  it("uses capsule tangents in rotated, translated rig frames and reports actual final penetration", () => {
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.35, -0.7, 0.6));
    transform.setPosition(0.4, -0.2, 0.7);
    const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(transform).toArray() as [number, number, number];
    const capsules = [-0.08, 0.08].map((x) => ({
      ...sphere(x, 0.1), currentHead: point(x, 0, 0), currentTail: point(x, 1, 0),
    }));
    const positions = new Float32Array(point(0, 0.5, 0));
    const radius = 0.005;
    const receipt = projectStudioVrmSkirtFinalContacts(positions, 0, new Float32Array([radius]), capsules);
    const output = new THREE.Vector3().fromArray(positions);
    const measured = Math.max(0, ...capsules.map((capsule) => {
      const segment = new THREE.Line3(new THREE.Vector3(...capsule.currentHead), new THREE.Vector3(...capsule.currentTail));
      return capsule.radius + radius - output.distanceTo(segment.closestPointToPoint(output, true, new THREE.Vector3()));
    }));
    expect(measured).toBeLessThanOrEqual(0.00001);
    expect(receipt.maxPenetrationM).toBeCloseTo(measured, 8);
    expect(receipt.maxDisplacementM).toBeLessThan(0.069);
  });

  it("reports unresolved bounded candidates honestly so the caller can reject the solve", () => {
    const capsules = [0, 1, 2].map((axis) => {
      const head: [number, number, number] = [0, 0, 0], tail: [number, number, number] = [0, 0, 0];
      head[axis] = -1; tail[axis] = 1;
      return { restHead: head, restTail: tail, currentHead: head, currentTail: tail, radius: 0.1 };
    });
    const positions = new Float32Array([0, 0, 0]);
    const result = projectStudioVrmSkirtFinalContacts(positions, 0, new Float32Array([0.005]), capsules);
    expect(result.maxPenetrationM).toBeGreaterThan(0.001);
    expect(result.passes).toBeLessThanOrEqual(24);
    expect([...positions].every(Number.isFinite)).toBe(true);
  });

  it.each([
    [[0, -1, 0], [0, 1, 0]],
    [[-1, 0, 0], [1, 0, 0]],
    [[0, 0, -1], [0, 0, 1]],
    [[0, 0, 0], [0, 0, 0]],
  ] as const)("resolves exact-axis contacts for %j → %j", (head, tail) => {
    const positions = new Float32Array(3);
    const capsule = { restHead: head, restTail: tail, currentHead: head, currentTail: tail, radius: 0.1 };
    const result = projectStudioVrmSkirtFinalContacts(positions, 0, new Float32Array([0.005]), [capsule]);
    expect([...positions].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...positions)).toBeCloseTo(0.10501, 5);
    expect(result.passes).toBe(1);
  });

  it("does not disturb an already clear surface and is deterministic", () => {
    const a = new Float32Array([1, 2, 3]);
    const before = a.slice();
    expect(projectStudioVrmSkirtFinalContacts(a, 0, new Float32Array([0.005]), [sphere(0, 0.1)]))
      .toEqual({ passes: 0, maxDisplacementM: 0, maxPenetrationM: 0 });
    expect(a).toEqual(before);
    const b = new Float32Array([0.01, 0.02, 0.03]), c = b.slice();
    projectStudioVrmSkirtFinalContacts(b, 0, new Float32Array([0.005]), [sphere(0, 0.1)]);
    projectStudioVrmSkirtFinalContacts(c, 0, new Float32Array([0.005]), [sphere(0, 0.1)]);
    expect(b).toEqual(c);
  });
});
