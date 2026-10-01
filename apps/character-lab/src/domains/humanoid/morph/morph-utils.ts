/**
 * morph 공용 유틸: 용접 델타 → 분할 정점 확장, 델타 법선, 영(0) 판정, 거울 대칭 오차(테스트).
 * 델타 법선은 (위치+델타)의 법선 − 기준 법선으로 계산한다(glTF morph NORMAL 델타 규약).
 */
import { computeVertexNormals } from "../geometry/tri-mesh";

export interface MorphBuffers {
  readonly deltaPositions: Float32Array;
  readonly deltaNormals: Float32Array;
}

/** 용접 정점 델타(×components)를 분할 정점으로 복사 */
export function expandDeltas(welded: Float32Array, vertexSource: Uint32Array, components = 3): Float32Array {
  const out = new Float32Array(vertexSource.length * components);
  for (let i = 0; i < vertexSource.length; i += 1) {
    const src = vertexSource[i] * components;
    for (let c = 0; c < components; c += 1) out[i * components + c] = welded[src + c];
  }
  return out;
}

/** 삼각 토폴로지에서 델타 법선(변형 후 법선 − 기준 법선) */
export function deltaNormals(positions: Float32Array, deltaPositions: Float32Array, triangles: Uint32Array, baseNormals: Float32Array): Float32Array {
  const moved = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 1) moved[i] = positions[i] + deltaPositions[i];
  const normals = computeVertexNormals(moved, triangles);
  for (let i = 0; i < normals.length; i += 1) normals[i] -= baseNormals[i];
  return normals;
}

/** 최대 절대값이 eps 이하이면 영 델타 */
export function isNegligibleDelta(delta: Float32Array, eps = 1e-9): boolean {
  for (let i = 0; i < delta.length; i += 1) if (Math.abs(delta[i]) > eps) return false;
  return true;
}

export function maxAbs(delta: Float32Array): number {
  let m = 0;
  for (let i = 0; i < delta.length; i += 1) m = Math.max(m, Math.abs(delta[i]));
  return m;
}

/**
 * 거울 대칭 오차: 정점 i와 거울 정점 j에 대해 (Δx_i + Δx_j, Δy_i − Δy_j, Δz_i − Δz_j)의 최대 절대값.
 * mirror[i] < 0인 정점은 건너뛴다.
 */
export function mirrorSymmetryError(delta: Float32Array, mirror: Int32Array): number {
  let worst = 0;
  for (let i = 0; i < mirror.length; i += 1) {
    const j = mirror[i];
    if (j < 0) continue;
    worst = Math.max(
      worst,
      Math.abs(delta[i * 3] + delta[j * 3]),
      Math.abs(delta[i * 3 + 1] - delta[j * 3 + 1]),
      Math.abs(delta[i * 3 + 2] - delta[j * 3 + 2]),
    );
  }
  return worst;
}

/** 두 델타가 서로 반대 방향인지: a + b의 최대 절대값이 eps 이하 */
export function isOppositeDelta(a: Float32Array, b: Float32Array, eps = 1e-6): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] + b[i]) > eps) return false;
  return true;
}

/** 델타 차 */
export function subtractArrays(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] - b[i];
  return out;
}
