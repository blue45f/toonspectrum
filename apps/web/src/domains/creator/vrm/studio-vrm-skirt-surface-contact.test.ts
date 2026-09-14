import { Matrix4, Quaternion, Triangle, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { projectStudioVrmSkirtSurfaceContacts } from "./studio-vrm-skirt-surface-contact";
import { StudioVrmSkirtTriangleDistance } from "./studio-vrm-skirt-triangle-distance";
import type { StudioVrmXpbdSkirtCapsuleProxy } from "./studio-vrm-xpbd-skirt";

function capsule(head: [number, number, number], tail = head, radius = 0.1): StudioVrmXpbdSkirtCapsuleProxy {
  return { currentHead: head, currentTail: tail, restHead: head, restTail: tail, radius, friction: 0 };
}
const indices = new Uint32Array([0, 1, 2]);
const radii = new Float32Array([0.002, 0.002, 0.002]);
function distanceToSphere(positions: Float32Array, center: [number, number, number]): number {
  const triangle = new Triangle(...[0, 3, 6].map((offset) => new Vector3().fromArray(positions, offset)) as [Vector3, Vector3, Vector3]);
  return triangle.closestPointToPoint(new Vector3(...center), new Vector3()).distanceTo(new Vector3(...center));
}

describe("skirt triangle capsule distance", () => {
  it("retains valid edge barycentrics when a triangle collapses to a segment", () => {
    const query = new StudioVrmSkirtTriangleDistance();
    query.triangle.set(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 0));
    query.head.set(0, 0, 0.2); query.tail.copy(query.head);
    expect(query.evaluate().distance).toBeCloseTo(0.2, 10);
    expect(query.barycentric.x + query.barycentric.y + query.barycentric.z).toBeCloseTo(1, 10);
  });
  it.each([
    { head: [0, 0, -1], tail: [0, 0, 1], distance: 0 },
    { head: [-2, 0, 0.2], tail: [2, 0, 0.2], distance: 0.2 },
    { head: [0, 0, 0.3], tail: [0, 0, 0.4], distance: 0.3 },
    { head: [0, -2, 0], tail: [0, -3, 0], distance: 1 },
  ])("measures the exact interior or edge minimum: %o", ({ head, tail, distance }) => {
    const query = new StudioVrmSkirtTriangleDistance();
    query.triangle.set(new Vector3(-1, -1, 0), new Vector3(1, -1, 0), new Vector3(0, 1, 0));
    query.head.fromArray(head); query.tail.fromArray(tail);
    expect(query.evaluate().distance).toBeCloseTo(distance, 10);
    expect(query.barycentric.x + query.barycentric.y + query.barycentric.z).toBeCloseTo(1, 10);
  });
});

describe("skirt final surface contacts", () => {
  it.each([0, 0.08])("corrects a sphere piercing the face while all three vertices are clear (z=%s)", (z) => {
    const initial = new Float32Array([-0.2, -0.2, z, 0.2, -0.2, z, 0, 0.2, z]);
    for (let i = 0; i < 3; i += 1) expect(Math.hypot(...initial.slice(i * 3, i * 3 + 3))).toBeGreaterThan(0.102);
    expect(distanceToSphere(initial, [0, 0, 0])).toBeLessThan(0.1);
    const positions = new Float32Array(initial);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 0, radii, [capsule([0, 0, 0])]);
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    expect(distanceToSphere(positions, [0, 0, 0])).toBeGreaterThan(0.101);
    expect(receipt.passes).toBeLessThanOrEqual(24);
    const repeated = new Float32Array(initial);
    expect(projectStudioVrmSkirtSurfaceContacts(repeated, indices, 0, radii, [capsule([0, 0, 0])])).toEqual(receipt);
    expect(repeated).toEqual(positions);
  });

  it("corrects an edge midpoint that pierces a sphere with a clear centroid and clear vertices", () => {
    const positions = new Float32Array([-0.2, 0, 0.02, 0.2, 0, 0.02, 0, 1, 0.02]);
    expect(new Vector3(0, 1 / 3, 0.02).length()).toBeGreaterThan(0.102);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 0, radii, [capsule([0, 0, 0])]);
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    expect(distanceToSphere(positions, [0, 0, 0])).toBeGreaterThan(0.101);
  });

  it("resolves a capsule axis crossing the triangle interior, not only a zero-length sphere", () => {
    const positions = new Float32Array([-0.3, -0.3, 0, 0.3, -0.3, 0, 0, 0.3, 0]);
    const proxy = capsule([0, 0, -0.2], [0, 0, 0.2]);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 0, radii, [proxy]);
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    // Independent reference: every sampled axis point stays outside the final triangle.
    for (let sample = 0; sample <= 400; sample += 1) {
      expect(distanceToSphere(positions, [0, 0, -0.2 + sample * 0.001])).toBeGreaterThan(0.101);
    }
  });

  it("keeps a clear waistband pin fixed while correcting overlapping thigh contacts", () => {
    const initial = new Float32Array([-0.3, -0.3, 0.06, 0.3, -0.3, 0.06, 0, 0.3, 0.06]);
    const proxies = [capsule([-0.06, 0, 0]), capsule([0.06, 0, 0])];
    const positions = new Float32Array(initial);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 1, radii, proxies);
    expect(positions.slice(0, 3)).toEqual(initial.slice(0, 3));
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    for (const proxy of proxies) expect(distanceToSphere(positions, [...proxy.currentHead])).toBeGreaterThan(0.101);
  });

  it("measures and clears contact after a rigid rotation and model-local translation", () => {
    const matrix = new Matrix4().compose(new Vector3(0.7, -0.4, 1.2),
      new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.1), new Vector3(1, 1, 1));
    const point = new Vector3();
    const positions = new Float32Array([-0.2, -0.2, 0.08, 0.2, -0.2, 0.08, 0, 0.2, 0.08]);
    for (let offset = 0; offset < positions.length; offset += 3) point.fromArray(positions, offset).applyMatrix4(matrix).toArray(positions, offset);
    const center = new Vector3().applyMatrix4(matrix).toArray() as [number, number, number];
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 0, radii, [capsule(center)]);
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    expect(distanceToSphere(positions, center)).toBeGreaterThan(0.101);
  });

  it("escapes a face trapped at an end-to-end knee capsule junction within a local body-diameter repair", () => {
    const initial = new Float32Array([-0.06, -0.2, 0.002, 0.06, -0.2, 0.002, 0, 0.2, 0.002]);
    const proxies = [capsule([0, 0, -0.3], [0, 0, 0]), capsule([0, 0, 0], [0, 0, 0.3])];
    const positions = new Float32Array(initial);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 0, radii, proxies);
    expect(receipt.maxTrianglePenetrationM).toBeLessThan(0.001);
    expect(receipt.maxDisplacementM).toBeLessThanOrEqual(receipt.maxDisplacementLimitM);
    expect(receipt.passes).toBeLessThanOrEqual(24);
    // Each individual normal correction can cross the shared endpoint into the other capsule.
    // Independently sample their combined axis against the final Three triangle.
    for (let sample = 0; sample <= 600; sample += 1) {
      expect(distanceToSphere(positions, [0, 0, -0.3 + sample * 0.001])).toBeGreaterThan(0.101);
    }
    const repeat = new Float32Array(initial);
    expect(projectStudioVrmSkirtSurfaceContacts(repeat, indices, 0, radii, proxies)).toEqual(receipt);
    expect(repeat).toEqual(positions);
  });

  it("preserves a pinned vertex and reports an impossible pinned contact instead of claiming success", () => {
    const positions = new Float32Array([0, 0, 0, 0.2, 0, 0, 0, 0.2, 0]);
    const receipt = projectStudioVrmSkirtSurfaceContacts(positions, indices, 1, radii, [capsule([0, 0, 0])]);
    expect(Array.from(positions.slice(0, 3))).toEqual([0, 0, 0]);
    expect(receipt.maxTrianglePenetrationM).toBeCloseTo(0.102, 7);
    expect(receipt.passes).toBeLessThanOrEqual(24);
  });
});
