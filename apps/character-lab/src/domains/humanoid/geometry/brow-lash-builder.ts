/**
 * 눈썹·속눈썹: 호를 따라가는 얇은 리본 슬래브(닫힌 로프트 튜브 + 캡). 머리 표면 함수(head-cage.ts)에 붙여 배치한다.
 * 눈썹은 좌우를 한 파츠로, 속눈썹은 눈 스타일별 좌우 각각 한 파츠로 만든다.
 */
import { v3Add, v3Cross, v3Normalize, v3Scale, v3Sub, type Vec3 } from "../../../shared/math";
import { HEAD_LANDMARKS, headLocalToWorld, type HeadFrame } from "../proportions";

import { EYE_STYLE_SPECS, eyeCenter, eyeballRadius, type EyeSide } from "./eye-builder";
import { headSurfacePoint } from "./head-cage";
import { loftTriTube, mergeTriMeshes, mirrorTriMeshX, type TriMesh } from "./tri-mesh";

import type { EyesStyleId } from "../../../contracts";

export const BROW_SEGMENTS = 9;
export const LASH_SEGMENTS = 11;

/** 표면 위 점: 방향 dir의 머리 표면을 lift배 밖으로 */
function surfaceAt(frame: HeadFrame, localDir: Vec3, lift: number): Vec3 {
  const p = headSurfacePoint(v3Normalize(localDir));
  return headLocalToWorld(frame, v3Scale(p, lift));
}

/** 리본 슬래브 링: 중심 c, 폭 방향 w(반폭 길이 포함), 두께 방향 t */
function slabRing(c: Vec3, w: Vec3, t: Vec3): Vec3[] {
  return [v3Sub(v3Sub(c, w), t), v3Add(v3Sub(c, w), t), v3Add(v3Add(c, w), t), v3Sub(v3Add(c, w), t)];
}

function browSide(frame: HeadFrame): TriMesh {
  const b = HEAD_LANDMARKS.brow;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= BROW_SEGMENTS; i += 1) {
    const u = i / BROW_SEGMENTS;
    // 안쪽(x 0.12) → 바깥(x 0.62), 완만한 아치(중간이 가장 높음)
    const x = 0.12 + 0.5 * u;
    const arch = 0.09 * Math.sin(Math.PI * u) - 0.06 * u;
    const y = b[1] + arch;
    const z = b[2] - 0.25 * u * u;
    const c = surfaceAt(frame, [x, y, z], 1.015);
    const normal = v3Normalize(v3Sub(c, frame.center));
    const taper = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.2));
    const halfWidth = 0.045 * frame.scale * taper;
    const thickness = 0.012 * frame.scale;
    const up: Vec3 = v3Normalize(v3Cross(v3Cross(normal, [0, 1, 0]), normal));
    rings.push(slabRing(c, v3Scale(up, halfWidth), v3Scale(normal, thickness)));
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  const centroid = (ring: readonly Vec3[]): Vec3 => v3Scale(ring.reduce<Vec3>((acc, p) => v3Add(acc, p), [0, 0, 0]), 1 / ring.length);
  return loftTriTube(rings, { capStart: centroid(first), capEnd: centroid(last), uvRect: { u0: 0, v0: 0, u1: 0.5, v1: 1 } });
}

/** 눈썹(좌우 합침, 오른쪽은 왼쪽의 x 거울) */
export function buildBrows(frame: HeadFrame): TriMesh {
  const left = browSide(frame);
  return mergeTriMeshes([left, mirrorTriMeshX(left)]);
}

/** 속눈썹: 윗눈꺼풀 가장자리를 따라 바깥·앞으로 뻗는 리본 */
export function buildLash(frame: HeadFrame, side: EyeSide, style: EyesStyleId): TriMesh {
  const left = buildLeftLash(frame, style);
  return side === "left" ? left : mirrorTriMeshX(left);
}

function buildLeftLash(frame: HeadFrame, style: EyesStyleId): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const center = eyeCenter(frame, "left");
  const r = eyeballRadius(frame) * 1.08;
  const rings: Vec3[][] = [];
  for (let i = 0; i <= LASH_SEGMENTS; i += 1) {
    const u = i / LASH_SEGMENTS;
    // 각: 안쪽 끝 → 위 → 바깥 끝 (위쪽 호, 왼눈 기준)
    const theta = Math.PI / 2 + spec.lashArc * (u - 0.5);
    const radial: Vec3 = [Math.cos(theta), Math.sin(theta), 0.35];
    const rn = v3Normalize(radial);
    const c = v3Add(center, v3Scale(rn, r));
    const taper = 0.4 + 0.6 * Math.sin(Math.PI * u);
    const length = spec.lashLength * frame.scale * taper;
    const outward: Vec3 = v3Normalize([rn[0] * (1 - spec.lashCurl), rn[1] * (1 - spec.lashCurl * 0.5), 0.3 + spec.lashCurl]);
    const tangent = v3Normalize(v3Cross(rn, [0, 0, 1]));
    const halfWidth = 0.004 * frame.scale * (0.5 + taper);
    const ring = slabRing(v3Add(c, v3Scale(outward, length / 2)), v3Scale(tangent, halfWidth), v3Scale(outward, length / 2));
    rings.push(ring);
  }
  const centroid = (ring: readonly Vec3[]): Vec3 => v3Scale(ring.reduce<Vec3>((acc, p) => v3Add(acc, p), [0, 0, 0]), 1 / ring.length);
  return loftTriTube(rings, { capStart: centroid(rings[0]), capEnd: centroid(rings[rings.length - 1]) });
}
