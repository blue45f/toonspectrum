import { Vector3 } from "three";

import { projectStudioVrmSkirtFinalContacts } from "./studio-vrm-skirt-contact-projection";
import { StudioVrmSkirtSurfaceEscape } from "./studio-vrm-skirt-surface-escape";
import { StudioVrmSkirtTriangleDistance } from "./studio-vrm-skirt-triangle-distance";
import type { StudioVrmXpbdSkirtCapsuleProxy } from "./studio-vrm-xpbd-skirt";

const MAX_PASSES = 24;
const CLEARANCE_M = 0.00001;

interface StudioVrmSkirtSurfaceContactReceipt {
  readonly passes: number;
  readonly maxDisplacementM: number;
  readonly maxDisplacementLimitM: number;
  readonly maxPenetrationM: number;
  readonly maxTrianglePenetrationM: number;
  /** Both partitions remain in the strict maximum; these explain infeasible fixed boundaries. */
  readonly maxPinnedTrianglePenetrationM: number;
  readonly maxFreeTrianglePenetrationM: number;
}

/** Bounded render-surface contact solve; pins and triangle connectivity are unchanged. */
export function projectStudioVrmSkirtSurfaceContacts(
  positions: Float32Array, indices: Uint32Array, pinnedPrefixCount: number,
  particleRadii: Float32Array, capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[],
): StudioVrmSkirtSurfaceContactReceipt {
  const original = new Float32Array(positions);
  // Contact repair is local to the body's thickness, not permission to reshape the garment.
  const maxDisplacementLimitM = 2 * (Math.max(0, ...capsules.map((capsule) => capsule.radius))
    + Math.max(0, ...particleRadii));
  const contact = new StudioVrmSkirtTriangleDistance();
  const escape = new StudioVrmSkirtSurfaceEscape(indices, particleRadii.length);
  const previousPenetrations = new Float64Array(indices.length / 3);
  const normal = new Vector3(), centroid = new Vector3(), toward = new Vector3();
  const vertices = [contact.triangle.a, contact.triangle.b, contact.triangle.c];
  const ids = [0, 0, 0];
  let passes = 0, maxPinnedTrianglePenetrationM = 0, maxFreeTrianglePenetrationM = 0;
  let corrected = false;
  function visit(correct: boolean): number {
    let maximum = 0;
    for (let offset = 0; offset < indices.length; offset += 3) {
      ids[0] = indices[offset]; ids[1] = indices[offset + 1]; ids[2] = indices[offset + 2];
      const radius = Math.max(particleRadii[ids[0]], particleRadii[ids[1]], particleRadii[ids[2]]);
      let triangleMaximum = 0, escaped = false;
      for (const capsule of capsules) {
        for (let corner = 0; corner < 3; corner += 1) vertices[corner].fromArray(positions, ids[corner] * 3);
        const clearance = capsule.radius + radius;
        let separated = false;
        for (let axis = 0; axis < 3; axis += 1) {
          const a = vertices[0].getComponent(axis), b = vertices[1].getComponent(axis), c = vertices[2].getComponent(axis);
          if (Math.min(a, b, c) > Math.max(capsule.currentHead[axis], capsule.currentTail[axis]) + clearance
            || Math.max(a, b, c) < Math.min(capsule.currentHead[axis], capsule.currentTail[axis]) - clearance) {
            separated = true; break;
          }
        }
        if (separated) continue;
        contact.head.fromArray(capsule.currentHead);
        contact.tail.fromArray(capsule.currentTail);
        contact.evaluate();
        const penetration = clearance - contact.distance;
        maximum = Math.max(maximum, penetration);
        triangleMaximum = Math.max(triangleMaximum, penetration);
        if (!correct) {
          if (ids[0] < pinnedPrefixCount || ids[1] < pinnedPrefixCount || ids[2] < pinnedPrefixCount) maxPinnedTrianglePenetrationM = Math.max(maxPinnedTrianglePenetrationM, penetration);
          else maxFreeTrianglePenetrationM = Math.max(maxFreeTrianglePenetrationM, penetration);
        }
        if (!correct || penetration <= CLEARANCE_M) continue;
        normal.subVectors(contact.point, contact.axisPoint);
        if (normal.lengthSq() <= 1e-20) {
          contact.triangle.getNormal(normal);
          contact.triangle.getMidpoint(centroid);
          toward.copy(centroid).addScaledVector(contact.head, -0.5).addScaledVector(contact.tail, -0.5);
          if (normal.dot(toward) < 0) normal.negate();
          if (normal.lengthSq() <= 1e-20) continue;
        } else normal.normalize();
        if (!escaped && penetration > 0.001 && previousPenetrations[offset / 3] > 0.001
          && penetration >= previousPenetrations[offset / 3] * 0.99
          && ids[0] >= pinnedPrefixCount && ids[1] >= pinnedPrefixCount && ids[2] >= pinnedPrefixCount) {
          const shift = escape.find(positions, ids, radius, capsules, normal, particleRadii, original, maxDisplacementLimitM);
          if (shift) {
            for (let corner = 0; corner < 3; corner += 1) vertices[corner].add(shift).toArray(positions, ids[corner] * 3);
            corrected = true; escaped = true;
            continue;
          }
        }
        let denominator = 0, largestWeight = 0;
        for (let corner = 0; corner < 3; corner += 1) {
          if (ids[corner] >= pinnedPrefixCount) {
            const weight = contact.barycentric.getComponent(corner);
            denominator += weight ** 2;
            largestWeight = Math.max(largestWeight, weight);
          }
        }
        if (denominator <= 1e-12) continue;
        // Position-based inequality projection at the actual contact, never a face centroid sample.
        // Near a fixed pin, inverse barycentric weights can otherwise launch a vertex many
        // metres. Bound each correction to one capsule diameter; unresolved remains explicit.
        const magnitude = Math.min((penetration + CLEARANCE_M) / denominator, 2 * clearance / largestWeight);
        for (let corner = 0; corner < 3; corner += 1) {
          if (ids[corner] < pinnedPrefixCount) continue;
          const particleOffset = ids[corner] * 3;
          const x = positions[particleOffset], y = positions[particleOffset + 1], z = positions[particleOffset + 2];
          vertices[corner].addScaledVector(normal, magnitude * contact.barycentric.getComponent(corner));
          vertices[corner].toArray(positions, particleOffset);
          corrected ||= positions[particleOffset] !== x || positions[particleOffset + 1] !== y || positions[particleOffset + 2] !== z;
        }
      }
      if (correct) previousPenetrations[offset / 3] = triangleMaximum;
    }
    return maximum;
  }
  let point = projectStudioVrmSkirtFinalContacts(positions, pinnedPrefixCount, particleRadii, capsules);
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    corrected = false;
    if (visit(true) <= CLEARANCE_M || !corrected) break;
    passes = pass + 1;
    point = projectStudioVrmSkirtFinalContacts(positions, pinnedPrefixCount, particleRadii, capsules);
  }
  const maxTrianglePenetrationM = visit(false);
  let maxDisplacementM = 0;
  for (let offset = pinnedPrefixCount * 3; offset < positions.length; offset += 3) {
    maxDisplacementM = Math.max(maxDisplacementM, Math.hypot(
      positions[offset] - original[offset], positions[offset + 1] - original[offset + 1], positions[offset + 2] - original[offset + 2],
    ));
  }
  return { passes, maxDisplacementM, maxDisplacementLimitM, maxPenetrationM: point.maxPenetrationM, maxTrianglePenetrationM, maxPinnedTrianglePenetrationM, maxFreeTrianglePenetrationM };
}
