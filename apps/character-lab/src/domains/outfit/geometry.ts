/**
 * outfit 지오메트리 유틸(순수, 결정적): 정점 누적기, 카드(쿼드 스트립)·원통 스윕(평행 이동 프레임)·
 * 구 셸·법선 재계산. 헤어 카드/번들·스커트 튜브·액세서리 프리미티브가 공통으로 쓴다.
 * `Math.random` 금지, 모든 입력이 같으면 같은 바이트를 낸다.
 */
import { v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub, v3AnyPerpendicular, v3Add } from "../../shared/math";

import type { Vec2, Vec3 } from "../../contracts";

/** 정점당 4본 스킨 가중치 */
export interface SkinWeight4 {
  readonly joints: readonly [number, number, number, number];
  readonly weights: readonly [number, number, number, number];
}

export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly jointIndices: Uint16Array;
  readonly jointWeights: Float32Array;
}

/** 단일 본에 가중치 1 */
export function singleJoint(bone: number): SkinWeight4 {
  return { joints: [bone, 0, 0, 0], weights: [1, 0, 0, 0] };
}

/** 두 본 블렌드(t = 두 번째 본 비율) */
export function blendJoints(a: number, b: number, t: number): SkinWeight4 {
  const tb = Math.min(1, Math.max(0, t));
  if (tb <= 0) return singleJoint(a);
  if (tb >= 1) return singleJoint(b);
  return { joints: [a, b, 0, 0], weights: [1 - tb, tb, 0, 0] };
}

/** 가변 길이 정점·삼각형 누적기(빌드 시 TypedArray로 고정) */
export class MeshAccumulator {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private readonly jointIndices: number[] = [];
  private readonly jointWeights: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  pushVertex(position: Vec3, normal: Vec3, uv: Vec2, skin: SkinWeight4): number {
    const index = this.vertexCount;
    this.positions.push(position[0], position[1], position[2]);
    this.normals.push(normal[0], normal[1], normal[2]);
    this.uvs.push(uv[0], uv[1]);
    this.jointIndices.push(skin.joints[0], skin.joints[1], skin.joints[2], skin.joints[3]);
    this.jointWeights.push(skin.weights[0], skin.weights[1], skin.weights[2], skin.weights[3]);
    return index;
  }

  pushTriangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** a-b-c-d 반시계 쿼드 → 삼각형 2개 */
  pushQuad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /** 다른 버퍼를 정점 오프셋을 더해 이어 붙인다. */
  append(buffers: MeshBuffers): void {
    const offset = this.vertexCount;
    for (let i = 0; i < buffers.positions.length; i += 1) this.positions.push(buffers.positions[i]);
    for (let i = 0; i < buffers.normals.length; i += 1) this.normals.push(buffers.normals[i]);
    for (let i = 0; i < buffers.uvs.length; i += 1) this.uvs.push(buffers.uvs[i]);
    for (let i = 0; i < buffers.jointIndices.length; i += 1) this.jointIndices.push(buffers.jointIndices[i]);
    for (let i = 0; i < buffers.jointWeights.length; i += 1) this.jointWeights.push(buffers.jointWeights[i]);
    for (let i = 0; i < buffers.indices.length; i += 1) this.indices.push(buffers.indices[i] + offset);
  }

  build(): MeshBuffers {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      indices: Uint32Array.from(this.indices),
      jointIndices: Uint16Array.from(this.jointIndices),
      jointWeights: Float32Array.from(this.jointWeights),
    };
  }
}

/** 면적 가중 정점 법선. 퇴화 정점은 [0,1,0]. */
export function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const v of [a, b, c]) {
      normals[v] += nx;
      normals[v + 1] += ny;
      normals[v + 2] += nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]);
    if (len > 1e-12) {
      normals[v] /= len;
      normals[v + 1] /= len;
      normals[v + 2] /= len;
    } else {
      normals[v] = 0;
      normals[v + 1] = 1;
      normals[v + 2] = 0;
    }
  }
  return normals;
}

/** 곡선 점열의 접선(중앙 차분, 끝은 전진/후진 차분). 길이 0은 [0,-1,0]. */
export function curveTangents(points: readonly Vec3[]): Vec3[] {
  const n = points.length;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const d = v3Sub(next, prev);
    out.push(v3Length(d) > 1e-12 ? v3Normalize(d) : [0, -1, 0]);
  }
  return out;
}

/**
 * 평행 이동(parallel transport) 프레임: 각 점에서 접선에 수직인 (side, up) 쌍.
 * 첫 프레임의 side는 `sideHint`를 접선에 투영한 것(0이면 임의 수직)이며 이후는 비틀림 없이 이어진다.
 */
export function transportFrames(points: readonly Vec3[], sideHint: Vec3): { tangents: Vec3[]; sides: Vec3[]; ups: Vec3[] } {
  const tangents = curveTangents(points);
  const sides: Vec3[] = [];
  const ups: Vec3[] = [];
  let side = v3Sub(sideHint, v3Scale(tangents[0], v3Dot(sideHint, tangents[0])));
  side = v3Length(side) > 1e-9 ? v3Normalize(side) : v3AnyPerpendicular(tangents[0]);
  for (let i = 0; i < points.length; i += 1) {
    const t = tangents[i];
    // 이전 side를 현재 접선에 재투영(비틀림 최소)
    let s = v3Sub(side, v3Scale(t, v3Dot(side, t)));
    s = v3Length(s) > 1e-9 ? v3Normalize(s) : v3AnyPerpendicular(t);
    side = s;
    sides.push(s);
    ups.push(v3Normalize(v3Cross(t, s)));
  }
  return { tangents, sides, ups };
}

export interface CardStripOptions {
  readonly points: readonly Vec3[];
  /** 링별 폭(m) */
  readonly widths: readonly number[];
  /** 카드 면이 향할 바깥 방향(각 링, 법선 힌트) */
  readonly outward: readonly Vec3[];
  /** 링별 스킨 가중치 */
  readonly skins: readonly SkinWeight4[];
  /** UV u 범위(아틀라스 분할) */
  readonly uRange?: Vec2;
}

/** 곡선을 따라 폭 w의 쿼드 스트립(헤어 카드·리본 꼬리)을 누적한다. 법선 = outward를 접선에 수직화. */
export function appendCardStrip(acc: MeshAccumulator, options: CardStripOptions): void {
  const { points, widths, outward, skins } = options;
  const n = points.length;
  if (n < 2) return;
  const tangents = curveTangents(points);
  const [u0, u1] = options.uRange ?? [0, 1];
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = tangents[i];
    let normal = v3Sub(outward[i], v3Scale(t, v3Dot(outward[i], t)));
    normal = v3Length(normal) > 1e-9 ? v3Normalize(normal) : v3AnyPerpendicular(t);
    const side = v3Normalize(v3Cross(normal, t));
    const half = widths[i] * 0.5;
    const v = n > 1 ? i / (n - 1) : 0;
    left.push(acc.pushVertex(v3Add(points[i], v3Scale(side, -half)), normal, [u0, v], skins[i]));
    right.push(acc.pushVertex(v3Add(points[i], v3Scale(side, half)), normal, [u1, v], skins[i]));
  }
  for (let i = 0; i + 1 < n; i += 1) {
    acc.pushQuad(left[i], right[i], right[i + 1], left[i + 1]);
  }
}

export interface TubeOptions {
  readonly points: readonly Vec3[];
  /** 링별 반경(m) */
  readonly radii: readonly number[];
  readonly sides: number;
  readonly skins: readonly SkinWeight4[];
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
  /** 첫 프레임 side 힌트 */
  readonly sideHint?: Vec3;
  readonly uRange?: Vec2;
}

/** 곡선을 따라 원통(헤어 번들·안경테·초커 등)을 누적한다. */
export function appendTube(acc: MeshAccumulator, options: TubeOptions): void {
  const { points, radii, sides, skins } = options;
  const n = points.length;
  if (n < 2 || sides < 3) return;
  const frames = transportFrames(points, options.sideHint ?? [1, 0, 0]);
  const [u0, u1] = options.uRange ?? [0, 1];
  const rings: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const ring: number[] = [];
    const v = i / (n - 1);
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const dir = v3Add(v3Scale(frames.sides[i], Math.cos(angle)), v3Scale(frames.ups[i], Math.sin(angle)));
      const radius = Math.max(0, radii[i]);
      const position = v3Add(points[i], v3Scale(dir, radius));
      const normal = radius > 0 ? dir : frames.tangents[i];
      ring.push(acc.pushVertex(position, normal, [u0 + (u1 - u0) * (s / sides), v], skins[i]));
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < n; i += 1) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let s = 0; s < sides; s += 1) {
      const s1 = (s + 1) % sides;
      acc.pushQuad(a[s], a[s1], b[s1], b[s]);
    }
  }
  if (options.capStart) {
    const center = acc.pushVertex(points[0], v3Scale(frames.tangents[0], -1), [u0, 0], skins[0]);
    const ring = rings[0];
    for (let s = 0; s < sides; s += 1) acc.pushTriangle(center, ring[(s + 1) % sides], ring[s]);
  }
  if (options.capEnd) {
    const last = n - 1;
    const center = acc.pushVertex(points[last], frames.tangents[last], [u0, 1], skins[last]);
    const ring = rings[last];
    for (let s = 0; s < sides; s += 1) acc.pushTriangle(center, ring[s], ring[(s + 1) % sides]);
  }
}

export interface SphereShellOptions {
  readonly center: Vec3;
  readonly radius: number;
  readonly up: Vec3;
  readonly forward: Vec3;
  /** 고도각 범위(rad, 0 = up 극점) */
  readonly elevationStart: number;
  readonly elevationEnd: number;
  /** 방위각 범위(rad, 0 = forward, +는 right 쪽) */
  readonly azimuthStart: number;
  readonly azimuthEnd: number;
  readonly rings: number;
  readonly segments: number;
  readonly skin: SkinWeight4;
  /** 법선 바깥(true, 기본) */
  readonly uRange?: Vec2;
}

/** 구면 좌표 → 방향 벡터(up·forward·right 기준) */
export function sphericalDirection(up: Vec3, forward: Vec3, azimuth: number, elevation: number): Vec3 {
  const right = v3Normalize(v3Cross(up, forward));
  const sinEl = Math.sin(elevation);
  return v3Normalize(
    v3Add(v3Scale(up, Math.cos(elevation)), v3Add(v3Scale(forward, Math.cos(azimuth) * sinEl), v3Scale(right, Math.sin(azimuth) * sinEl))),
  );
}

/** 부분 구 셸(헤어 캡·모자·후드)을 누적한다. */
export function appendSphereShell(acc: MeshAccumulator, options: SphereShellOptions): void {
  const { rings, segments } = options;
  if (rings < 1 || segments < 2) return;
  const [u0, u1] = options.uRange ?? [0, 1];
  const grid: number[][] = [];
  for (let r = 0; r <= rings; r += 1) {
    const row: number[] = [];
    const el = options.elevationStart + ((options.elevationEnd - options.elevationStart) * r) / rings;
    for (let s = 0; s <= segments; s += 1) {
      const az = options.azimuthStart + ((options.azimuthEnd - options.azimuthStart) * s) / segments;
      const dir = sphericalDirection(options.up, options.forward, az, el);
      row.push(acc.pushVertex(v3Add(options.center, v3Scale(dir, options.radius)), dir, [u0 + (u1 - u0) * (s / segments), r / rings], options.skin));
    }
    grid.push(row);
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      acc.pushQuad(grid[r][s], grid[r][s + 1], grid[r + 1][s + 1], grid[r + 1][s]);
    }
  }
}

/** 축 정렬 상자(신발 밑창 등). 6면 24정점. */
export function appendBox(acc: MeshAccumulator, center: Vec3, halfExtents: Vec3, skin: SkinWeight4): void {
  const faces: Array<{ n: Vec3; u: Vec3; v: Vec3 }> = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  for (const face of faces) {
    const base = v3Add(center, [face.n[0] * halfExtents[0], face.n[1] * halfExtents[1], face.n[2] * halfExtents[2]]);
    const du: Vec3 = [face.u[0] * halfExtents[0], face.u[1] * halfExtents[1], face.u[2] * halfExtents[2]];
    const dv: Vec3 = [face.v[0] * halfExtents[0], face.v[1] * halfExtents[1], face.v[2] * halfExtents[2]];
    const a = acc.pushVertex(v3Add(base, v3Add(v3Scale(du, -1), v3Scale(dv, -1))), face.n, [0, 0], skin);
    const b = acc.pushVertex(v3Add(base, v3Add(du, v3Scale(dv, -1))), face.n, [1, 0], skin);
    const c = acc.pushVertex(v3Add(base, v3Add(du, dv)), face.n, [1, 1], skin);
    const d = acc.pushVertex(v3Add(base, v3Add(v3Scale(du, -1), dv)), face.n, [0, 1], skin);
    acc.pushQuad(a, b, c, d);
  }
}

/** 원(중심·법선·반경) 위 점열(닫힘: 첫 점을 끝에 다시 넣는다) */
export function circlePoints(center: Vec3, normal: Vec3, radius: number, segments: number, closed = true): Vec3[] {
  const n = v3Normalize(normal);
  const a = v3AnyPerpendicular(n);
  const b = v3Normalize(v3Cross(n, a));
  const out: Vec3[] = [];
  const count = closed ? segments + 1 : segments;
  for (let i = 0; i < count; i += 1) {
    const angle = ((i % segments) / segments) * Math.PI * 2;
    out.push(v3Add(center, v3Add(v3Scale(a, Math.cos(angle) * radius), v3Scale(b, Math.sin(angle) * radius))));
  }
  return out;
}

/** 호(arc): 중심·축 a/b 평면에서 angle0..angle1 */
export function arcPoints(center: Vec3, axisA: Vec3, axisB: Vec3, radius: number, angle0: number, angle1: number, segments: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = angle0 + ((angle1 - angle0) * i) / segments;
    out.push(v3Add(center, v3Add(v3Scale(axisA, Math.cos(angle) * radius), v3Scale(axisB, Math.sin(angle) * radius))));
  }
  return out;
}

/** n개 값을 a→b 선형 보간한 배열 */
export function rampArray(count: number, a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(count > 1 ? a + ((b - a) * i) / (count - 1) : a);
  return out;
}

export function repeatArray<T>(count: number, value: T): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) out.push(value);
  return out;
}
