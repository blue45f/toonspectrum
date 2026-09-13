import type { StudioVrmXpbdSkirtCapsuleProxy } from "./studio-vrm-xpbd-skirt";

const PASSES = 24;
const CLEARANCE_EPSILON_M = 0.00001;
type Direction = readonly [number, number, number];

function penetrationAt(
  px: number, py: number, pz: number, particleRadius: number,
  capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[], clearance = 0,
): number {
  let maximum = 0;
  for (const capsule of capsules) {
    const [hx, hy, hz] = capsule.currentHead;
    const ax = capsule.currentTail[0] - hx, ay = capsule.currentTail[1] - hy, az = capsule.currentTail[2] - hz;
    const lengthSquared = ax * ax + ay * ay + az * az;
    const t = lengthSquared > 1e-12
      ? Math.max(0, Math.min(1, ((px - hx) * ax + (py - hy) * ay + (pz - hz) * az) / lengthSquared)) : 0;
    const distance = Math.hypot(px - hx - ax * t, py - hy - ay * t, pz - hz - az * t);
    if (!Number.isFinite(distance)) return Infinity;
    maximum = Math.max(maximum, capsule.radius + particleRadius + clearance - distance);
  }
  return maximum;
}

/** A bounded escape only when normal projection would stagnate or deepen another contact. */
function tangentEscape(
  px: number, py: number, pz: number, radius: number, tangent: Direction,
  capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[],
): Direction | undefined {
  const tangentLength = Math.hypot(...tangent);
  const directions: Direction[] = [
    ...(tangentLength > 1e-10 ? [
      [tangent[0] / tangentLength, tangent[1] / tangentLength, tangent[2] / tangentLength] as Direction,
      [-tangent[0] / tangentLength, -tangent[1] / tangentLength, -tangent[2] / tangentLength] as Direction,
    ] : []),
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  const limit = 2 * Math.max(...capsules.map((capsule) => capsule.radius + radius)) + CLEARANCE_EPSILON_M;
  let bestLength = Infinity;
  let best: Direction | undefined;
  for (const [dx, dy, dz] of directions) {
    if (penetrationAt(px + dx * limit, py + dy * limit, pz + dz * limit, radius, capsules, CLEARANCE_EPSILON_M) > 0) continue;
    // Keep the upper endpoint outside every capsule. This does not assume their union is convex;
    // it finds a safe boundary on this bounded ray, then chooses the shortest candidate ray.
    let lower = 0, upper = limit;
    for (let refinement = 0; refinement < 12; refinement += 1) {
      const middle = (lower + upper) / 2;
      if (penetrationAt(px + dx * middle, py + dy * middle, pz + dz * middle, radius, capsules, CLEARANCE_EPSILON_M) > 0)
        lower = middle;
      else upper = middle;
    }
    if (upper < bestLength) { bestLength = upper; best = [dx * upper, dy * upper, dz * upper]; }
  }
  return best;
}

/**
 * Final render contact correction. XPBD's last capsule can push a point into an earlier capsule;
 * project the deepest remaining contact repeatedly without reintroducing stretch constraints.
 * This preserves pins and connectivity, but is not a cloth self-collision or mesh collision solve.
 */
export function projectStudioVrmSkirtFinalContacts(
  positions: Float32Array,
  pinnedPrefixCount: number,
  particleRadii: Float32Array,
  capsules: readonly StudioVrmXpbdSkirtCapsuleProxy[],
): { readonly passes: number; readonly maxDisplacementM: number; readonly maxPenetrationM: number } {
  const original = new Float32Array(positions);
  let passes = 0;
  for (let pass = 0; pass < PASSES; pass += 1) {
    let changed = false;
    for (let particle = pinnedPrefixCount; particle < particleRadii.length; particle += 1) {
      const offset = particle * 3;
      const px = positions[offset], py = positions[offset + 1], pz = positions[offset + 2];
      let deepest = CLEARANCE_EPSILON_M;
      let correction: readonly [number, number, number] | undefined;
      let tangent: Direction = [0, 0, 0];
      for (const capsule of capsules) {
        const [hx, hy, hz] = capsule.currentHead;
        const ax = capsule.currentTail[0] - hx;
        const ay = capsule.currentTail[1] - hy;
        const az = capsule.currentTail[2] - hz;
        const lengthSquared = ax * ax + ay * ay + az * az;
        const t = lengthSquared > 1e-12
          ? Math.max(0, Math.min(1, ((px - hx) * ax + (py - hy) * ay + (pz - hz) * az) / lengthSquared))
          : 0;
        let nx = px - hx - ax * t, ny = py - hy - ay * t, nz = pz - hz - az * t;
        const distance = Math.hypot(nx, ny, nz);
        const penetration = capsule.radius + particleRadii[particle] - distance;
        if (penetration <= deepest) continue;
        if (distance > 1e-10) {
          nx /= distance; ny /= distance; nz /= distance;
        } else {
          // A deterministic perpendicular avoids leaving exact-axis contacts embedded.
          if (lengthSquared <= 1e-12) { nx = 1; ny = 0; nz = 0; }
          else {
            if (Math.abs(ax) < Math.abs(ay)) { nx = 0; ny = -az; nz = ay; }
            else { nx = -az; ny = 0; nz = ax; }
            if (Math.hypot(nx, ny, nz) < 1e-10) { nx = -ay; ny = ax; nz = 0; }
            const normalLength = Math.hypot(nx, ny, nz);
            nx /= normalLength; ny /= normalLength; nz /= normalLength;
          }
        }
        deepest = penetration;
        const shift = penetration + CLEARANCE_EPSILON_M;
        correction = [nx * shift, ny * shift, nz * shift];
        tangent = [ny * az - nz * ay, nz * ax - nx * az, nx * ay - ny * ax];
      }
      if (!correction) continue;
      const normalResidual = penetrationAt(px + correction[0], py + correction[1], pz + correction[2], particleRadii[particle], capsules);
      if (normalResidual >= deepest - 1e-12) {
        correction = tangentEscape(px, py, pz, particleRadii[particle], tangent, capsules);
        if (!correction) continue; // Leave unresolved contacts visible in the final receipt.
      }
      positions[offset] += correction[0];
      positions[offset + 1] += correction[1];
      positions[offset + 2] += correction[2];
      changed = true;
    }
    if (!changed) break;
    passes = pass + 1;
  }
  let maxDisplacementM = 0;
  let maxPenetrationM = 0;
  for (let offset = pinnedPrefixCount * 3; offset < positions.length; offset += 3) {
    maxDisplacementM = Math.max(maxDisplacementM, Math.hypot(
      positions[offset] - original[offset],
      positions[offset + 1] - original[offset + 1],
      positions[offset + 2] - original[offset + 2],
    ));
    maxPenetrationM = Math.max(maxPenetrationM, penetrationAt(
      positions[offset], positions[offset + 1], positions[offset + 2], particleRadii[offset / 3], capsules,
    ));
  }
  return { passes, maxDisplacementM, maxPenetrationM };
}
