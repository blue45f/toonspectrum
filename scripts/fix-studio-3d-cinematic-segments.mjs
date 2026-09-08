import { readFile, writeFile } from "node:fs/promises";

const BLUEPRINT_PATH =
  "apps/web/src/domains/creator/bg3d/studio-bg3d-cinematic-asset-blueprints.ts";

const before = `function segmentRotation(start: Vec3, end: Vec3): Vec3 {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length <= 1e-6) {
    throw new Error("Cinematic 3D segment endpoints must be distinct and finite.");
  }
  const pitch = Math.asin(Math.max(-1, Math.min(1, dz / length)));
  const roll = Math.atan2(-dx, dy);
  return [pitch, 0, roll];
}`;

const after = `function quaternionToEulerXyz(
  x: number,
  y: number,
  z: number,
  w: number,
): Vec3 {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const eulerY = Math.asin(Math.max(-1, Math.min(1, m13)));
  const nearGimbalLock = Math.abs(m13) >= 0.9999999;
  const eulerX = nearGimbalLock ? Math.atan2(m32, m22) : Math.atan2(-m23, m33);
  const eulerZ = nearGimbalLock ? 0 : Math.atan2(-m12, m11);
  return [eulerX, eulerY, eulerZ];
}

/** Aligns local +Y to an arbitrary finite world-space segment. */
function segmentRotation(start: Vec3, end: Vec3): Vec3 {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length <= 1e-6) {
    throw new Error("Cinematic 3D segment endpoints must be distinct and finite.");
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const unitZ = dz / length;
  if (unitY <= -0.9999999) {
    return [Math.PI, 0, 0];
  }

  // Shortest-arc quaternion from local +Y to the normalized segment direction.
  const rawX = unitZ;
  const rawY = 0;
  const rawZ = -unitX;
  const rawW = 1 + unitY;
  const quaternionLength = Math.hypot(rawX, rawY, rawZ, rawW);
  return quaternionToEulerXyz(
    rawX / quaternionLength,
    rawY,
    rawZ / quaternionLength,
    rawW / quaternionLength,
  );
}`;

let source = await readFile(BLUEPRINT_PATH, "utf8");
const first = source.indexOf(before);
if (first < 0) throw new Error("Missing cinematic segment orientation patch anchor.");
if (source.indexOf(before, first + before.length) >= 0) {
  throw new Error("Cinematic segment orientation patch anchor is not unique.");
}
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
await writeFile(BLUEPRINT_PATH, source);
console.log("Applied quaternion-based cinematic segment orientation.");
