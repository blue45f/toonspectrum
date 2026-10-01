/**
 * 단면 스윕(로프트): 2D 프로파일을 프레임 열을 따라 배치해 링을 만들고 쿼드 튜브로 잇는다.
 * 원리: Hyun et al. 2005 Sweep-based Human Deformation — 본 축을 따라 단면 링을 로프트하면
 * 토폴로지가 고정돼 morph target 호환이 된다(코드 복제 없음, 개념만).
 */
import { v3Add, v3Cross, v3Dot, v3Normalize, v3Scale, v3Sub, type Vec2, type Vec3 } from "../../../shared/math";

import { QuadMeshBuilder, type QuadMesh } from "./quad-mesh";

export interface Frame {
  readonly origin: Vec3;
  /** 단면 x축(단위) */
  readonly u: Vec3;
  /** 단면 y축(단위) */
  readonly v: Vec3;
  /** 진행 방향(단위) */
  readonly tangent: Vec3;
}

export interface Harmonic {
  /** 차수 m(cos mθ) */
  readonly m: number;
  readonly amplitude: number;
  readonly phase?: number;
}

/** 단면 점을 프레임 공간으로: origin + x·u + y·v */
export function frameToWorld(frame: Frame, p: Vec2): Vec3 {
  return v3Add(frame.origin, v3Add(v3Scale(frame.u, p[0]), v3Scale(frame.v, p[1])));
}

/**
 * 타원 단면(n은 짝수). ρ(θ) = (rx cos θ, ry sin θ)·(1 + Σ a_m cos(mθ + φ_m)).
 * 점 k는 θ_k = 2πk/n. 점 0은 +x 방향.
 */
export function ellipseProfile(n: number, rx: number, ry: number, harmonics: readonly Harmonic[] = []): Vec2[] {
  const points: Vec2[] = [];
  for (let k = 0; k < n; k += 1) {
    const theta = (2 * Math.PI * k) / n;
    let scale = 1;
    for (const h of harmonics) scale += h.amplitude * Math.cos(h.m * theta + (h.phase ?? 0));
    points.push([rx * Math.cos(theta) * scale, ry * Math.sin(theta) * scale]);
  }
  return points;
}

/**
 * 폴리라인을 따라 프레임을 만든다. 접선은 양옆 점의 차(끝점은 한쪽), u는 uHint를 접선에 수직으로 투영한 것,
 * v = tangent × u. uHint가 접선과 평행하면 throw(무음 프레임 뒤틀림 금지).
 */
export function framesAlongPath(points: readonly Vec3[], uHint: Vec3): Frame[] {
  if (points.length < 2) throw new Error("프레임 경로에는 점이 2개 이상 필요합니다.");
  const frames: Frame[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = v3Normalize(v3Sub(next, prev));
    const u = v3Normalize(v3Sub(uHint, v3Scale(tangent, v3Dot(uHint, tangent))));
    if (v3Dot(u, u) === 0) throw new Error(`프레임 ${i}: uHint가 접선과 평행합니다.`);
    const v = v3Normalize(v3Cross(tangent, u));
    frames.push({ origin: points[i], u, v, tangent });
  }
  return frames;
}

/** 프레임마다 프로파일(옵션: 프레임별 스케일)을 배치한 링 배열 */
export function sweepRings(profile: readonly Vec2[], frames: readonly Frame[], scales?: readonly Vec2[]): Vec3[][] {
  return frames.map((frame, j) => {
    const scale = scales?.[j] ?? [1, 1];
    return profile.map((p) => frameToWorld(frame, [p[0] * scale[0], p[1] * scale[1]]));
  });
}

/**
 * 좌우 대칭 링(XZ 평면, θ는 +z에서 +x 방향). c와 n−c가 정확히 x 부호만 다르고 c=0, n/2는 x=0이다.
 * shape(θ, c)는 반지름 배율(1=타원), zShift는 z 오프셋 함수.
 */
export function symmetricRingXZ(
  n: number,
  center: Vec3,
  rx: number,
  rz: number,
  shape: (theta: number) => number = () => 1,
  zShift: (theta: number) => number = () => 0,
): Vec3[] {
  if (n % 2 !== 0) throw new Error("대칭 링은 짝수 n만 지원합니다.");
  const half = n / 2;
  const points: Vec3[] = new Array<Vec3>(n);
  for (let c = 0; c <= half; c += 1) {
    const theta = (2 * Math.PI * c) / n;
    const s = shape(theta);
    const x = c === 0 || c === half ? 0 : rx * Math.sin(theta) * s;
    const z = rz * Math.cos(theta) * s + zShift(theta);
    points[c] = [center[0] + x, center[1], center[2] + z];
    if (c !== 0 && c !== half) points[n - c] = [center[0] - x, center[1], center[2] + z];
  }
  return points;
}

/** 링 배열의 x를 뒤집는다(오른쪽 사지 = 왼쪽의 정확한 거울). */
export function mirrorRingsX(rings: readonly (readonly Vec3[])[]): Vec3[][] {
  return rings.map((ring) => ring.map((p): Vec3 => [-p[0], p[1], p[2]]));
}

/**
 * 스펙 공개 API: 프로파일을 프레임 열로 스윕한 열린 쿼드 튜브(원통 UV: u=둘레, v=진행).
 * 캡은 없다(케이지 조립기가 브리지·캡을 붙인다).
 */
export function sweepSection(profile: readonly Vec2[], path: readonly Frame[]): QuadMesh {
  const builder = new QuadMeshBuilder();
  const rings = sweepRings(profile, path);
  const n = profile.length;
  const ringIndices = rings.map((ring) => builder.addVertices(ring));
  const uvRows = rings.map((_, j) => {
    const v = path.length > 1 ? j / (path.length - 1) : 0;
    const row: number[] = [];
    for (let k = 0; k <= n; k += 1) row.push(builder.addUv(k / n, v));
    return row;
  });
  builder.addTube(ringIndices, uvRows);
  return builder.build();
}
