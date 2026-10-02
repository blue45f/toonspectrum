/**
 * 치아(상·하 아치, 한 파츠)와 혀. 입 안 경계 상자(MOUTH_BOUNDS_LOCAL) 안에 둔다.
 * 아치는 반타원 경로를 따라 작은 직사각형 단면을 로프트한 닫힌 튜브, 혀는 납작한 타원체다.
 */
import { v3Add, v3Scale, type Vec3 } from "../../../shared/math";
import { HEAD_LANDMARKS, headLocalToWorld, type HeadFrame } from "../proportions";

import { loftTriTube, mergeTriMeshes, triMeshBounds, uvSphere, type Bounds, type TriMesh } from "./tri-mesh";

/** 입 안 경계(머리 로컬) */
export const MOUTH_BOUNDS_LOCAL = {
  min: [-0.3, -0.56, 0.25] as Vec3,
  max: [0.3, -0.3, 0.8] as Vec3,
} as const;

export const TEETH_ARCH_SEGMENTS = 14;
/** 윗니/아랫니 y(로컬) */
export const UPPER_TEETH_Y = -0.37;
export const LOWER_TEETH_Y = -0.465;
export const TONGUE_CENTER_LOCAL: Vec3 = [0, -0.485, 0.45];

function archRings(y: number, halfWidth: number, depth: number, height: number, thickness: number): Vec3[][] {
  const rings: Vec3[][] = [];
  const z0 = HEAD_LANDMARKS.mouth[2] - 0.35;
  for (let i = 0; i <= TEETH_ARCH_SEGMENTS; i += 1) {
    const t = -Math.PI * 0.42 + (Math.PI * 0.84 * i) / TEETH_ARCH_SEGMENTS;
    const x = halfWidth * Math.sin(t);
    const z = z0 + depth * Math.cos(t);
    // 단면: 안쪽/바깥쪽 × 위/아래
    const nx = Math.sin(t) * thickness;
    const nz = Math.cos(t) * thickness;
    rings.push([
      [x - nx, y - height / 2, z - nz],
      [x + nx, y - height / 2, z + nz],
      [x + nx, y + height / 2, z + nz],
      [x - nx, y + height / 2, z - nz],
    ]);
  }
  return rings;
}

function toWorldRings(frame: HeadFrame, rings: readonly (readonly Vec3[])[]): Vec3[][] {
  return rings.map((ring) => ring.map((p) => headLocalToWorld(frame, p)));
}

function centroid(ring: readonly Vec3[]): Vec3 {
  return v3Scale(ring.reduce<Vec3>((acc, p) => v3Add(acc, p), [0, 0, 0]), 1 / ring.length);
}

/** 치아(상·하 아치 병합). 윗니는 앞 절반 UV, 아랫니는 뒤 절반 UV. */
export function buildTeeth(frame: HeadFrame): TriMesh {
  const upper = toWorldRings(frame, archRings(UPPER_TEETH_Y, 0.21, 0.22, 0.07, 0.022));
  const lower = toWorldRings(frame, archRings(LOWER_TEETH_Y, 0.19, 0.2, 0.06, 0.02));
  const upperMesh = loftTriTube(upper, { capStart: centroid(upper[0]), capEnd: centroid(upper[upper.length - 1]), uvRect: { u0: 0, v0: 0.5, u1: 1, v1: 1 } });
  const lowerMesh = loftTriTube(lower, { capStart: centroid(lower[0]), capEnd: centroid(lower[lower.length - 1]), uvRect: { u0: 0, v0: 0, u1: 1, v1: 0.5 } });
  return mergeTriMeshes([upperMesh, lowerMesh]);
}

/** 혀: 납작한 타원체 */
export function buildTongue(frame: HeadFrame): TriMesh {
  const s = frame.scale;
  return uvSphere({ center: headLocalToWorld(frame, TONGUE_CENTER_LOCAL), radii: [0.15 * s, 0.04 * s, 0.17 * s], longitudes: 12, latitudes: 8 });
}

/** 입 안 경계(모델 공간) */
export function mouthBounds(frame: HeadFrame): Bounds {
  return { min: headLocalToWorld(frame, MOUTH_BOUNDS_LOCAL.min), max: headLocalToWorld(frame, MOUTH_BOUNDS_LOCAL.max) };
}

/** 메시가 경계 상자 안에 있는지(여유 eps) */
export function boundsContain(outer: Bounds, mesh: Pick<TriMesh, "positions">, eps = 1e-6): boolean {
  const inner = triMeshBounds(mesh.positions);
  for (let i = 0; i < 3; i += 1) {
    if (inner.min[i] < outer.min[i] - eps || inner.max[i] > outer.max[i] + eps) return false;
  }
  return true;
}

/** 모델 공간 점이 윗니/아랫니 중 아랫니(턱과 함께 움직임)인지: 두 아치 y의 중간 아래 */
export function isLowerTeethPoint(frame: HeadFrame, p: Vec3): boolean {
  const mid = frame.center[1] + ((UPPER_TEETH_Y + LOWER_TEETH_Y) / 2) * frame.scale;
  return p[1] < mid;
}
