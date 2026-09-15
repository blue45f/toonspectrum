import { Vector3 } from "three";

import { StudioVrmSkirtTriangleDistance } from "./studio-vrm-skirt-triangle-distance";
import type { StudioVrmXpbdSkirtCapsuleProxy, StudioVrmXpbdSkirtWaistFrame } from "./studio-vrm-xpbd-skirt";

export interface StudioVrmSkirtWaistClearance {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly offsetY: number;
}

/**
 * Fits the entire closed waistband polygon, including its chords, to the rest-body capsules.
 * A low hip-bone origin is not an anatomical waist: first lift above the thigh-root caps so
 * sitting does not require a waistband as wide as a thigh is long. This is a fixed rest-shape
 * decision, never a per-pose displacement of kinematic pins. Unqualified extreme poses still
 * have to pass the solver's independent whole-triangle collision gate.
 */
export function fitStudioVrmSkirtWaistClearance(input: {
  readonly frame: StudioVrmXpbdSkirtWaistFrame;
  readonly capsules: Readonly<Record<string, StudioVrmXpbdSkirtCapsuleProxy>>;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly segmentCount: number;
  readonly pleatCount: number;
  readonly pleatAmplitudeRatio: number;
  readonly particleRadius: number;
  readonly maxOffsetY: number;
  readonly maxRadius: number;
}): StudioVrmSkirtWaistClearance | null {
  const { frame, capsules, segmentCount, particleRadius } = input;
  const up = new Vector3(...frame.up), right = new Vector3(...frame.right), forward = new Vector3(...frame.forward);
  const origin = new Vector3(...frame.center);
  const clearance = particleRadius + 0.002; // Float32 and the adjacent movable faces need positive clearance.
  let offsetY = 0;
  for (const id of ["leftThigh", "rightThigh"]) {
    const capsule = capsules[id];
    if (capsule) {
      const axis = new Vector3(...capsule.restTail).sub(new Vector3(...capsule.restHead));
      const alongUp = axis.dot(up);
      // The waist plane can tilt relative to a resting thigh. Its 90-degree bend envelope
      // therefore rises by the perpendicular component; root-cap height alone misses sitting.
      const bendRise = alongUp <= 0 ? Math.sqrt(Math.max(0, axis.lengthSq() - alongUp * alongUp)) : axis.length();
      offsetY = Math.max(offsetY, new Vector3(...capsule.restHead).sub(origin).dot(up)
        + bendRise + capsule.radius + clearance);
    }
  }
  if (!Number.isFinite(offsetY) || offsetY > input.maxOffsetY) return null;
  offsetY = Math.fround(offsetY);
  const center = origin.clone().addScaledVector(up, offsetY);
  const vertices = Array.from({ length: segmentCount }, () => new Vector3());
  const distance = new StudioVrmSkirtTriangleDistance();
  const entries = Object.values(capsules);
  const fits = (expansion: number): boolean => {
    const radiusX = Math.fround(input.radiusX + expansion), radiusZ = Math.fround(input.radiusZ + expansion);
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = index / segmentCount * Math.PI * 2;
      const pleat = 1 + input.pleatAmplitudeRatio * 0.08 * Math.cos(input.pleatCount * angle);
      vertices[index].copy(center)
        .addScaledVector(right, Math.cos(angle) * radiusX * pleat)
        .addScaledVector(forward, Math.sin(angle) * radiusZ * pleat);
      vertices[index].set(Math.fround(vertices[index].x), Math.fround(vertices[index].y), Math.fround(vertices[index].z));
    }
    for (const capsule of entries) {
      distance.head.set(...capsule.restHead); distance.tail.set(...capsule.restTail);
      for (let index = 0; index < segmentCount; index += 1) {
        // A degenerate triangle enumerates exactly the segment/segment candidates.
        distance.triangle.a.copy(vertices[index]);
        distance.triangle.b.copy(vertices[(index + 1) % segmentCount]);
        distance.triangle.c.copy(vertices[index]);
        if (distance.evaluate().distance < capsule.radius + clearance) return false;
      }
    }
    return true;
  };
  if (fits(0)) return Object.freeze({ radiusX: input.radiusX, radiusZ: input.radiusZ, offsetY });
  const maximum = input.maxRadius - Math.max(input.radiusX, input.radiusZ);
  if (!(maximum > 0)) return null;
  // Find an outer safe bracket first; exact final admission never relies on a vertex-only test.
  let lower = 0, upper = Math.min(0.01, maximum);
  while (!fits(upper)) {
    lower = upper;
    if (upper >= maximum) return null;
    upper = Math.min(maximum, upper * 2);
  }
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (fits(middle)) upper = middle; else lower = middle;
  }
  if (!fits(upper)) return null;
  return Object.freeze({ radiusX: Math.fround(input.radiusX + upper), radiusZ: Math.fround(input.radiusZ + upper), offsetY });
}
