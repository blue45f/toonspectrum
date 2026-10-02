/**
 * Catmull-Clark 세분(경계 규칙 포함)을 선형 스텐실(희소 행렬)로 만든다.
 *
 * CC는 고정 토폴로지에서 위치의 선형 연산자이므로, 같은 스텐실을 morph 델타·영역 one-hot에 재적용하면
 * "케이지에서 ±1 재생성 → 델타 → 리프트"가 정확히 세분 결과의 차와 같다(Catmull & Clark 1978, 수식만).
 * UV는 별도 토폴로지(섬 경계)로 같은 규칙을 적용하고, 최종 삼각 메시는 (위치, UV) 쌍으로 정점을 분할한다.
 */
import { computeVertexNormals } from "./tri-mesh";

import type { QuadMesh } from "./quad-mesh";

export interface SparseStencil {
  readonly rowCount: number;
  readonly colCount: number;
  readonly rowPtr: Uint32Array;
  readonly cols: Uint32Array;
  readonly weights: Float64Array;
}

export interface LevelPlan {
  readonly position: SparseStencil;
  readonly uv: SparseStencil;
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
}

export interface SubdivisionPlan {
  readonly levels: readonly LevelPlan[];
  readonly cageVertexCount: number;
  readonly cageUvCount: number;
  readonly vertexCount: number;
  readonly uvCount: number;
  /** 최종 레벨의 쿼드 면(위치 인덱스) */
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
}

export interface SubdividedMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly faces: Uint32Array;
  readonly uvFaces: Uint32Array;
  readonly regions: Uint8Array;
  readonly plan: SubdivisionPlan;
}

const EDGE_KEY_BASE = 0x200000;

interface LevelTopology {
  readonly stencil: SparseStencil;
  readonly faces: Uint32Array;
}

function buildLevelTopology(vertexCount: number, faces: Uint32Array): LevelTopology {
  const faceCount = faces.length / 4;
  const edgeIndex = new Map<number, number>();
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeFace0: number[] = [];
  const edgeFace1: number[] = [];
  const faceEdges = new Uint32Array(faces.length);
  const vertexFaces: number[][] = Array.from({ length: vertexCount }, () => []);
  const vertexEdges: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let f = 0; f < faceCount; f += 1) {
    for (let i = 0; i < 4; i += 1) {
      const a = faces[f * 4 + i];
      const b = faces[f * 4 + ((i + 1) % 4)];
      vertexFaces[a].push(f);
      const key = a < b ? a * EDGE_KEY_BASE + b : b * EDGE_KEY_BASE + a;
      let e = edgeIndex.get(key);
      if (e === undefined) {
        e = edgeA.length;
        edgeIndex.set(key, e);
        edgeA.push(Math.min(a, b));
        edgeB.push(Math.max(a, b));
        edgeFace0.push(f);
        edgeFace1.push(-1);
        vertexEdges[a].push(e);
        vertexEdges[b].push(e);
      } else if (edgeFace1[e] === -1 && edgeFace0[e] !== f) {
        edgeFace1[e] = f;
      } else if (edgeFace0[e] !== f) {
        throw new Error(`간선 ${a}-${b}에 면이 3개 이상입니다(비다양체).`);
      }
      faceEdges[f * 4 + i] = e;
    }
  }
  const edgeCount = edgeA.length;
  const rowCount = vertexCount + edgeCount + faceCount;
  const rows: Map<number, number>[] = new Array<Map<number, number>>(rowCount);
  const accumulate = (row: Map<number, number>, col: number, w: number): void => {
    row.set(col, (row.get(col) ?? 0) + w);
  };
  // 면점
  for (let f = 0; f < faceCount; f += 1) {
    const row = new Map<number, number>();
    for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], 0.25);
    rows[vertexCount + edgeCount + f] = row;
  }
  // 간선점
  for (let e = 0; e < edgeCount; e += 1) {
    const row = new Map<number, number>();
    if (edgeFace1[e] === -1) {
      accumulate(row, edgeA[e], 0.5);
      accumulate(row, edgeB[e], 0.5);
    } else {
      accumulate(row, edgeA[e], 0.25);
      accumulate(row, edgeB[e], 0.25);
      for (const f of [edgeFace0[e], edgeFace1[e]]) {
        for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], 1 / 16);
      }
    }
    rows[vertexCount + e] = row;
  }
  // 정점점
  for (let v = 0; v < vertexCount; v += 1) {
    const row = new Map<number, number>();
    const edges = vertexEdges[v];
    const n = edges.length;
    if (n === 0) {
      // 면에 쓰이지 않는 정점은 그대로 둔다(빌더 compact 후에는 없다).
      accumulate(row, v, 1);
      rows[v] = row;
      continue;
    }
    const boundaryEdges = edges.filter((e) => edgeFace1[e] === -1);
    if (boundaryEdges.length > 0) {
      if (vertexFaces[v].length <= 1 || boundaryEdges.length !== 2) {
        // 모서리(섬 꼭짓점)는 고정한다.
        accumulate(row, v, 1);
      } else {
        accumulate(row, v, 0.75);
        for (const e of boundaryEdges) accumulate(row, edgeA[e] === v ? edgeB[e] : edgeA[e], 0.125);
      }
      rows[v] = row;
      continue;
    }
    const inv = 1 / n;
    const inv2 = inv * inv;
    accumulate(row, v, (n - 3) * inv);
    for (const f of vertexFaces[v]) {
      for (let i = 0; i < 4; i += 1) accumulate(row, faces[f * 4 + i], 0.25 * inv2);
    }
    for (const e of edges) {
      accumulate(row, edgeA[e], inv2);
      accumulate(row, edgeB[e], inv2);
    }
    rows[v] = row;
  }
  // CSR(열 정렬로 결정성 보장)
  let nnz = 0;
  for (const row of rows) nnz += row.size;
  const rowPtr = new Uint32Array(rowCount + 1);
  const cols = new Uint32Array(nnz);
  const weights = new Float64Array(nnz);
  let cursor = 0;
  for (let r = 0; r < rowCount; r += 1) {
    rowPtr[r] = cursor;
    const sorted = [...rows[r].entries()].sort((x, y) => x[0] - y[0]);
    for (const [col, w] of sorted) {
      cols[cursor] = col;
      weights[cursor] = w;
      cursor += 1;
    }
  }
  rowPtr[rowCount] = cursor;
  // 새 면
  const newFaces = new Uint32Array(faceCount * 16);
  for (let f = 0; f < faceCount; f += 1) {
    const fp = vertexCount + edgeCount + f;
    for (let i = 0; i < 4; i += 1) {
      const v = faces[f * 4 + i];
      const eNext = vertexCount + faceEdges[f * 4 + i];
      const ePrev = vertexCount + faceEdges[f * 4 + ((i + 3) % 4)];
      const base = (f * 4 + i) * 4;
      newFaces[base] = v;
      newFaces[base + 1] = eNext;
      newFaces[base + 2] = fp;
      newFaces[base + 3] = ePrev;
    }
  }
  return { stencil: { rowCount, colCount: vertexCount, rowPtr, cols, weights }, faces: newFaces };
}

export function applyStencil(stencil: SparseStencil, input: ArrayLike<number>, components: number): Float32Array {
  if (input.length !== stencil.colCount * components) {
    throw new Error(`스텐실 입력 길이(${input.length})가 ${stencil.colCount}×${components}와 다릅니다.`);
  }
  const out = new Float32Array(stencil.rowCount * components);
  const scratch = new Float64Array(components);
  for (let r = 0; r < stencil.rowCount; r += 1) {
    scratch.fill(0);
    for (let k = stencil.rowPtr[r]; k < stencil.rowPtr[r + 1]; k += 1) {
      const col = stencil.cols[k] * components;
      const w = stencil.weights[k];
      for (let c = 0; c < components; c += 1) scratch[c] += w * input[col + c];
    }
    for (let c = 0; c < components; c += 1) out[r * components + c] = scratch[c];
  }
  return out;
}

/** 케이지 정점 속성을 모든 레벨을 거쳐 최종 정점으로 */
export function liftAttribute(plan: SubdivisionPlan, values: ArrayLike<number>, components: number): Float32Array {
  let current: ArrayLike<number> = values;
  for (const level of plan.levels) current = applyStencil(level.position, current, components);
  return current instanceof Float32Array ? current : Float32Array.from(current);
}

export function liftUvs(plan: SubdivisionPlan, uvs: ArrayLike<number>): Float32Array {
  let current: ArrayLike<number> = uvs;
  for (const level of plan.levels) current = applyStencil(level.uv, current, 2);
  return current instanceof Float32Array ? current : Float32Array.from(current);
}

/** 영역 태그를 one-hot 보간 후 argmax(동률은 낮은 id)로 전파 */
export function liftRegions(plan: SubdivisionPlan, regions: Uint8Array, regionCount: number): Uint8Array {
  const oneHot = new Float32Array(regions.length * regionCount);
  for (let i = 0; i < regions.length; i += 1) {
    const r = regions[i];
    if (r < regionCount) oneHot[i * regionCount + r] = 1;
  }
  const lifted = liftAttribute(plan, oneHot, regionCount);
  const out = new Uint8Array(plan.vertexCount);
  for (let i = 0; i < plan.vertexCount; i += 1) {
    let best = 0;
    let bestValue = -1;
    for (let r = 0; r < regionCount; r += 1) {
      const value = lifted[i * regionCount + r];
      if (value > bestValue + 1e-9) {
        bestValue = value;
        best = r;
      }
    }
    out[i] = bestValue <= 0 ? 255 : best;
  }
  return out;
}

export function buildSubdivisionPlan(mesh: QuadMesh, levels: 0 | 1 | 2): SubdivisionPlan {
  const levelPlans: LevelPlan[] = [];
  let vertexCount = mesh.positions.length / 3;
  let uvCount = mesh.uvs.length / 2;
  let faces = mesh.faces;
  let uvFaces = mesh.uvFaces;
  for (let l = 0; l < levels; l += 1) {
    const position = buildLevelTopology(vertexCount, faces);
    const uv = buildLevelTopology(uvCount, uvFaces);
    vertexCount = position.stencil.rowCount;
    uvCount = uv.stencil.rowCount;
    faces = position.faces;
    uvFaces = uv.faces;
    levelPlans.push({ position: position.stencil, uv: uv.stencil, faces, uvFaces });
  }
  return {
    levels: levelPlans,
    cageVertexCount: mesh.positions.length / 3,
    cageUvCount: mesh.uvs.length / 2,
    vertexCount,
    uvCount,
    faces,
    uvFaces,
  };
}

/** 세분 후 정점 수 예측: V' = V + E + F, E' = 2E + 4F, F' = 4F */
export function predictVertexCount(mesh: Pick<QuadMesh, "positions" | "faces">, levels: number): number {
  let v = mesh.positions.length / 3;
  let f = mesh.faces.length / 4;
  const edgeSet = new Set<number>();
  for (let i = 0; i < mesh.faces.length; i += 4) {
    for (let k = 0; k < 4; k += 1) {
      const a = mesh.faces[i + k];
      const b = mesh.faces[i + ((k + 1) % 4)];
      edgeSet.add(a < b ? a * EDGE_KEY_BASE + b : b * EDGE_KEY_BASE + a);
    }
  }
  let e = edgeSet.size;
  for (let l = 0; l < levels; l += 1) {
    const nv = v + e + f;
    const ne = 2 * e + 4 * f;
    const nf = 4 * f;
    v = nv;
    e = ne;
    f = nf;
  }
  return v;
}

export const REGION_LIFT_COUNT = 16;

/** 스펙 공개 API: 케이지를 levels회 세분한다(위치·UV·영역). */
export function catmullClark(mesh: QuadMesh, levels: 0 | 1 | 2): SubdividedMesh {
  const plan = buildSubdivisionPlan(mesh, levels);
  return {
    positions: liftAttribute(plan, mesh.positions, 3),
    uvs: liftUvs(plan, mesh.uvs),
    faces: plan.faces,
    uvFaces: plan.uvFaces,
    regions: liftRegions(plan, mesh.regions, REGION_LIFT_COUNT),
    plan,
  };
}

export interface SplitTriMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  /** 분할 정점 → 위치(용접) 정점 인덱스 */
  readonly vertexSource: Uint32Array;
  /** 위치 인덱스 공간의 삼각형(법선·델타 법선 재계산용) */
  readonly weldedTriangles: Uint32Array;
  readonly weldedVertexCount: number;
  readonly regions: Uint8Array;
}

/** (위치, UV) 쌍으로 정점을 분할하고 쿼드를 삼각화한다. 법선은 용접 정점 기준으로 계산해 솔기에서도 매끈하다. */
export function subdividedToTriMesh(sub: Pick<SubdividedMesh, "positions" | "uvs" | "faces" | "uvFaces" | "regions">): SplitTriMesh {
  const uvCount = sub.uvs.length / 2;
  const pairIndex = new Map<number, number>();
  const vertexSourceList: number[] = [];
  const uvSourceList: number[] = [];
  const corner = new Uint32Array(sub.faces.length);
  for (let i = 0; i < sub.faces.length; i += 1) {
    const p = sub.faces[i];
    const t = sub.uvFaces[i];
    const key = p * uvCount + t;
    let index = pairIndex.get(key);
    if (index === undefined) {
      index = vertexSourceList.length;
      pairIndex.set(key, index);
      vertexSourceList.push(p);
      uvSourceList.push(t);
    }
    corner[i] = index;
  }
  const splitCount = vertexSourceList.length;
  const positions = new Float32Array(splitCount * 3);
  const uvs = new Float32Array(splitCount * 2);
  const regions = new Uint8Array(splitCount);
  const vertexSource = Uint32Array.from(vertexSourceList);
  for (let i = 0; i < splitCount; i += 1) {
    const p = vertexSourceList[i];
    const t = uvSourceList[i];
    positions[i * 3] = sub.positions[p * 3];
    positions[i * 3 + 1] = sub.positions[p * 3 + 1];
    positions[i * 3 + 2] = sub.positions[p * 3 + 2];
    uvs[i * 2] = sub.uvs[t * 2];
    uvs[i * 2 + 1] = sub.uvs[t * 2 + 1];
    regions[i] = sub.regions[p];
  }
  const faceCount = sub.faces.length / 4;
  const indices = new Uint32Array(faceCount * 6);
  const weldedTriangles = new Uint32Array(faceCount * 6);
  for (let f = 0; f < faceCount; f += 1) {
    const base = f * 4;
    const a = corner[base];
    const b = corner[base + 1];
    const c = corner[base + 2];
    const d = corner[base + 3];
    indices.set([a, b, c, a, c, d], f * 6);
    weldedTriangles.set(
      [sub.faces[base], sub.faces[base + 1], sub.faces[base + 2], sub.faces[base], sub.faces[base + 2], sub.faces[base + 3]],
      f * 6,
    );
  }
  const weldedVertexCount = sub.positions.length / 3;
  const weldedNormals = computeVertexNormals(sub.positions, weldedTriangles);
  const normals = expandWelded(weldedNormals, vertexSource, 3);
  return { positions, normals, uvs, indices, vertexSource, weldedTriangles, weldedVertexCount, regions };
}

/** 용접 정점 속성을 분할 정점으로 복사 */
export function expandWelded(values: Float32Array, vertexSource: Uint32Array, components: number): Float32Array {
  const out = new Float32Array(vertexSource.length * components);
  for (let i = 0; i < vertexSource.length; i += 1) {
    const src = vertexSource[i] * components;
    for (let c = 0; c < components; c += 1) out[i * components + c] = values[src + c];
  }
  return out;
}
