/**
 * 합성 캡처용 AABB 투영(순수). readback 불가 레인(NullEngine)에서 파츠의 월드 AABB 8모서리를
 * view·projection 행렬로 화면 사각형과 선형 뷰 깊이로 바꿔 readback.ts의 SyntheticBox를 만든다.
 * 행렬은 16개 float, 평행이동이 12·13·14(Babylon 메모리 배치 = glTF column-major와 동일).
 */
import { clamp } from "../shared/math";

import type { Vec3 } from "../contracts";

export interface ProjectedAabb {
  /** 픽셀 사각형(top-down, x1/y1 exclusive) */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** 중심의 선형 뷰 깊이 0=near..1=far */
  readonly depth01: number;
}

function transform4(m: ArrayLike<number>, p: Vec3): readonly [number, number, number, number] {
  const [x, y, z] = p;
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
    (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 1),
  ];
}

/**
 * AABB(min·max)를 투영한다. 모든 모서리가 카메라 뒤(w ≤ 0)이거나 행렬이 비정상이면 null.
 * 우수 좌표에서 뷰 공간 전방은 −Z이므로 뷰 깊이 = −view(p).z.
 */
export function projectAabb(min: Vec3, max: Vec3, view: ArrayLike<number>, projection: ArrayLike<number>, width: number, height: number, near: number, far: number): ProjectedAabb | null {
  if (!(width > 0) || !(height > 0) || !(far > near)) return null;
  let sx0 = Number.POSITIVE_INFINITY;
  let sy0 = Number.POSITIVE_INFINITY;
  let sx1 = Number.NEGATIVE_INFINITY;
  let sy1 = Number.NEGATIVE_INFINITY;
  let visible = 0;
  let depthSum = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    const p: Vec3 = [corner & 1 ? max[0] : min[0], corner & 2 ? max[1] : min[1], corner & 4 ? max[2] : min[2]];
    const v = transform4(view, p);
    const viewZ = -v[2];
    const clip = transform4(projection, [v[0], v[1], v[2]]);
    const w = clip[3];
    if (!(w > 1e-6) || !Number.isFinite(w)) continue;
    const ndcX = clip[0] / w;
    const ndcY = clip[1] / w;
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) continue;
    const px = (ndcX * 0.5 + 0.5) * width;
    const py = (1 - (ndcY * 0.5 + 0.5)) * height;
    sx0 = Math.min(sx0, px);
    sy0 = Math.min(sy0, py);
    sx1 = Math.max(sx1, px);
    sy1 = Math.max(sy1, py);
    depthSum += viewZ;
    visible += 1;
  }
  if (visible === 0) return null;
  const depth01 = clamp((depthSum / visible - near) / (far - near), 0, 1);
  return { x0: sx0, y0: sy0, x1: sx1, y1: sy1, depth01 };
}

/** 월드 AABB 목록의 합집합(비어 있으면 null) */
export function unionAabb(boxes: ReadonlyArray<{ readonly min: Vec3; readonly max: Vec3 }>): { readonly min: Vec3; readonly max: Vec3 } | null {
  if (boxes.length === 0) return null;
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const box of boxes) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i] ?? 0, box.min[i] ?? 0);
      max[i] = Math.max(max[i] ?? 0, box.max[i] ?? 0);
    }
  }
  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return null;
  return { min, max };
}
