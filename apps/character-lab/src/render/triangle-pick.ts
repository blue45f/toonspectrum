/**
 * 삼각형 레이캐스트(순수). Babylon `scene.pickWithRay`는 스키닝·morph를 반영하지 않은 bind 포즈 삼각형을 쓰므로(실측:
 * 엉덩이를 돌려도 원래 위치가 맞고 새 위치는 비어 있음), 포즈가 적용된 위치 배열(스킨+morph 반영, 메시 로컬 공간)에 대해
 * 자체 레이캐스트를 한다. 큰 메시(≤140k 삼각형)가 포인터 이동마다 전부 검사되지 않도록 연속 삼각형 묶음(기본 64개)의 AABB를
 * 먼저 검사한다 — 메시 정점 순서는 공간적으로 응집돼 있어 대부분의 묶음이 한 번의 슬랩 검사로 기각된다.
 *
 * 수식: Möller–Trumbore 교차(양면), 슬랩 AABB 교차. 좌표는 모두 같은 공간(여기서는 메시 로컬)이며 광선 방향은 정규화하지
 * 않아도 된다(파라미터 t는 그 방향 길이 기준).
 */
import type { Vec3 } from "../contracts";

export const TRIANGLE_GROUP_SIZE = 64;
const EPSILON = 1e-9;

export type IndexArray = Uint16Array | Uint32Array | readonly number[];

export interface LocalRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface TriangleHit {
  /** 삼각형 번호(인덱스 배열 기준 /3) */
  readonly triangle: number;
  /** 광선 파라미터: 점 = origin + direction × t */
  readonly t: number;
  /** 정점 1·2의 무게중심 좌표(정점 0은 1 − u − v) */
  readonly u: number;
  readonly v: number;
}

/** 묶음별 AABB(minX,minY,minZ,maxX,maxY,maxZ × 묶음 수) */
export function computeGroupBoxes(positions: ArrayLike<number>, indices: IndexArray, groupSize = TRIANGLE_GROUP_SIZE): Float32Array {
  const triangleCount = Math.floor(indices.length / 3);
  const groups = Math.ceil(triangleCount / groupSize);
  const boxes = new Float32Array(groups * 6);
  for (let g = 0; g < groups; g += 1) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const first = g * groupSize;
    const last = Math.min(triangleCount, first + groupSize);
    for (let tri = first; tri < last; tri += 1) {
      for (let k = 0; k < 3; k += 1) {
        const p = (indices[tri * 3 + k] ?? 0) * 3;
        const x = positions[p] ?? 0;
        const y = positions[p + 1] ?? 0;
        const z = positions[p + 2] ?? 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
    boxes.set([minX, minY, minZ, maxX, maxY, maxZ], g * 6);
  }
  return boxes;
}

/** 슬랩 AABB 교차: [tMin, tMax]와 겹치면 true(유한 t만) */
export function rayIntersectsBox(ray: LocalRay, boxes: ArrayLike<number>, offset: number, maxT: number): boolean {
  let tMin = 0;
  let tMax = maxT;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = ray.origin[axis] ?? 0;
    const d = ray.direction[axis] ?? 0;
    const lo = boxes[offset + axis] ?? 0;
    const hi = boxes[offset + 3 + axis] ?? 0;
    if (Math.abs(d) < EPSILON) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return false;
  }
  return true;
}

/**
 * 광선과 삼각형 목록의 가장 가까운 교차(t > 0). 교차가 없으면 null.
 * `maxT`를 주면 그보다 먼 교차는 무시한다(여러 메시 중 가장 가까운 것 선택에 쓴다).
 */
export function raycastTriangles(
  positions: ArrayLike<number>,
  indices: IndexArray,
  groupBoxes: ArrayLike<number> | null,
  ray: LocalRay,
  maxT = Number.POSITIVE_INFINITY,
  groupSize = TRIANGLE_GROUP_SIZE,
): TriangleHit | null {
  const triangleCount = Math.floor(indices.length / 3);
  let best: TriangleHit | null = null;
  let limit = maxT;
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const groups = groupBoxes ? Math.ceil(triangleCount / groupSize) : 1;
  const effectiveGroup = groupBoxes ? groupSize : triangleCount;
  for (let g = 0; g < groups; g += 1) {
    if (groupBoxes && !rayIntersectsBox(ray, groupBoxes, g * 6, limit)) continue;
    const first = g * effectiveGroup;
    const last = Math.min(triangleCount, first + effectiveGroup);
    for (let tri = first; tri < last; tri += 1) {
      const i0 = (indices[tri * 3] ?? 0) * 3;
      const i1 = (indices[tri * 3 + 1] ?? 0) * 3;
      const i2 = (indices[tri * 3 + 2] ?? 0) * 3;
      const ax = positions[i0] ?? 0;
      const ay = positions[i0 + 1] ?? 0;
      const az = positions[i0 + 2] ?? 0;
      const e1x = (positions[i1] ?? 0) - ax;
      const e1y = (positions[i1 + 1] ?? 0) - ay;
      const e1z = (positions[i1 + 2] ?? 0) - az;
      const e2x = (positions[i2] ?? 0) - ax;
      const e2y = (positions[i2 + 1] ?? 0) - ay;
      const e2z = (positions[i2 + 2] ?? 0) - az;
      // p = d × e2
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < EPSILON) continue;
      const inv = 1 / det;
      const tx = ox - ax;
      const ty = oy - ay;
      const tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      // q = t × e1
      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t <= 0 || t >= limit) continue;
      limit = t;
      best = { triangle: tri, t, u, v };
    }
  }
  return best;
}

/** 교차점의 UV(정점 UV의 무게중심 보간). UV가 없으면 [0, 0]. */
export function interpolateUv(uvs: ArrayLike<number> | null, indices: IndexArray, hit: TriangleHit): readonly [number, number] {
  if (!uvs) return [0, 0];
  const i0 = (indices[hit.triangle * 3] ?? 0) * 2;
  const i1 = (indices[hit.triangle * 3 + 1] ?? 0) * 2;
  const i2 = (indices[hit.triangle * 3 + 2] ?? 0) * 2;
  const w0 = 1 - hit.u - hit.v;
  return [w0 * (uvs[i0] ?? 0) + hit.u * (uvs[i1] ?? 0) + hit.v * (uvs[i2] ?? 0), w0 * (uvs[i0 + 1] ?? 0) + hit.u * (uvs[i1 + 1] ?? 0) + hit.v * (uvs[i2 + 1] ?? 0)];
}

/** 삼각형의 세 정점(로컬) */
export function triangleVertices(positions: ArrayLike<number>, indices: IndexArray, triangle: number): readonly [Vec3, Vec3, Vec3] {
  const read = (k: number): Vec3 => {
    const p = (indices[triangle * 3 + k] ?? 0) * 3;
    return [positions[p] ?? 0, positions[p + 1] ?? 0, positions[p + 2] ?? 0];
  };
  return [read(0), read(1), read(2)];
}

/** 면 법선(단위, 정점 순서의 오른손 규칙). 퇴화 삼각형이면 null. */
export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length < EPSILON) return null;
  return [nx / length, ny / length, nz / length];
}
