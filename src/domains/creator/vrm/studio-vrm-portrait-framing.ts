/** Landmark-based portrait regions. Estimates are deliberately conservative;
 * they are framing aids, not a claim of exact head-mesh segmentation.
 */
type Vec3 = readonly [number, number, number];
export interface StudioVrmPortraitBounds { readonly min: Vec3; readonly max: Vec3 }
export interface StudioVrmPortraitLandmarks {
  readonly head?: Vec3;
  readonly neck?: Vec3;
  readonly leftEye?: Vec3;
  readonly rightEye?: Vec3;
  readonly chest?: Vec3;
  readonly leftUpperArm?: Vec3;
  readonly rightUpperArm?: Vec3;
}
const finite = (v: Vec3 | undefined): v is Vec3 => Boolean(v && v.length === 3 && v.every(Number.isFinite));
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const midpoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export function resolveStudioVrmPortraitBounds(
  presetId: string,
  body: StudioVrmPortraitBounds,
  points: StudioVrmPortraitLandmarks,
): StudioVrmPortraitBounds | null {
  if (!["closeup", "dramaticEye", "bust"].includes(presetId)) return null;
  if (!finite(body.min) || !finite(body.max) || !finite(points.head)) return null;
  const span = body.max.map((value, i) => value - body.min[i]);
  if (span.some((v) => v < 0) || span[1] < 0.05 || Math.max(...span) > 100) return null;
  const head = points.head;
  // Ignore stale/out-of-model landmarks instead of flying to a foreign skeleton.
  if (head.some((v, i) => v < body.min[i] - span[1] * 0.1 || v > body.max[i] + span[1] * 0.1)) return null;
  const neckSpan = finite(points.neck) ? distance(head, points.neck) : 0;
  const validEyes = finite(points.leftEye) && finite(points.rightEye)
    && distance(points.leftEye, head) < span[1] * 0.35
    && distance(points.rightEye, head) < span[1] * 0.35;
  const eyeSpan = validEyes ? distance(points.leftEye!, points.rightEye!) : 0;
  const radius = clamp(Math.max(span[1] * 0.065, neckSpan * 1.25, eyeSpan * 1.65), span[1] * 0.05, span[1] * 0.22);
  const up: Vec3 = finite(points.neck) && neckSpan > 1e-5
    ? [(head[0] - points.neck[0]) / neckSpan, (head[1] - points.neck[1]) / neckSpan, (head[2] - points.neck[2]) / neckSpan]
    : [0, 1, 0];
  const eyeCenter = validEyes ? midpoint(points.leftEye!, points.rightEye!) : null;
  const center: Vec3 = eyeCenter ?? [head[0] + up[0] * radius * 0.45, head[1] + up[1] * radius * 0.45, head[2] + up[2] * radius * 0.45];
  const extent: Vec3 = presetId === "dramaticEye" && eyeCenter
    ? [radius * 0.95, radius * 0.72, radius * 0.65]
    : [radius * 1.05, radius * 1.2, radius * 0.95];
  const min: [number, number, number] = [center[0] - extent[0], center[1] - extent[1], center[2] - extent[2]];
  const max: [number, number, number] = [center[0] + extent[0], center[1] + extent[1], center[2] + extent[2]];
  if (presetId === "bust") {
    const chest: Vec3 = finite(points.chest) && distance(points.chest, head) < span[1] * 0.75
      ? points.chest
      : [head[0] - up[0] * radius * 2.1, head[1] - up[1] * radius * 2.1, head[2] - up[2] * radius * 2.1];
    const torsoPoints = [chest, points.leftUpperArm, points.rightUpperArm];
    for (const point of torsoPoints) {
      if (!finite(point) || distance(point, head) > span[1] * 0.85) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        const padding = radius * (axis === 2 ? 0.85 : 0.5);
        min[axis] = Math.min(min[axis], point[axis] - padding);
        max[axis] = Math.max(max[axis], point[axis] + padding);
      }
    }
  }
  return { min, max };
}
