/**
 * 바디 추종(스펙 §5.4 follow-body): 의상 정점 → 몸 정점 매핑, 스킨 웨이트 상속, 체형 morph 델타 전파,
 * 체형 케이지 오프셋 셸 추출.
 *
 * - 매핑은 정점당 최대 4개 몸 정점의 역거리 가중(k-NN, 균일 격자 가속, 동률은 인덱스 순)으로 결정적이다.
 * - 오프셋 셸(의상 몸판)은 선택한 몸 삼각형을 법선 방향으로 밀어낸 사본이며 매핑은 항등(가중치 1)이다.
 * - morph 전파는 같은 매핑으로 Δu = Σ w_k Δv_k (MB-Lab 프록시 피팅 개념, 코드 미열람·수식만 재구현).
 */
import { BODY_REGIONS, bodyRegionIndex } from "../../contracts";

import type { MeshBuffers } from "./geometry";
import type { BodyRegion, BodySurface, MorphDelta } from "../../contracts";

/** 의상 정점당 4개 (몸 정점, 가중치) */
export interface BodyMapping {
  readonly bodyVertex: Uint32Array;
  readonly weight: Float32Array;
}

export const MAPPING_K = 4;

/** 항등 매핑(셸: 의상 정점 v ↔ 몸 정점 source[v]) */
export function identityMapping(source: Uint32Array): BodyMapping {
  const count = source.length;
  const bodyVertex = new Uint32Array(count * MAPPING_K);
  const weight = new Float32Array(count * MAPPING_K);
  for (let v = 0; v < count; v += 1) {
    bodyVertex[v * MAPPING_K] = source[v];
    weight[v * MAPPING_K] = 1;
  }
  return { bodyVertex, weight };
}

/** 균일 격자 최근접 탐색기(몸 정점) */
export interface VertexGrid {
  readonly cellSize: number;
  readonly cells: Map<number, number[]>;
  readonly positions: Float32Array;
  readonly count: number;
}

const GRID_DIM = 4096;

function cellKey(ix: number, iy: number, iz: number): number {
  return ((ix + GRID_DIM / 2) * GRID_DIM + (iy + GRID_DIM / 2)) * GRID_DIM + (iz + GRID_DIM / 2);
}

export function buildVertexGrid(positions: Float32Array, cellSize = 0.05, mask?: Uint8Array): VertexGrid {
  const count = positions.length / 3;
  const cells = new Map<number, number[]>();
  for (let v = 0; v < count; v += 1) {
    if (mask && mask[v] === 0) continue;
    const ix = Math.floor(positions[v * 3] / cellSize);
    const iy = Math.floor(positions[v * 3 + 1] / cellSize);
    const iz = Math.floor(positions[v * 3 + 2] / cellSize);
    const key = cellKey(ix, iy, iz);
    const bucket = cells.get(key);
    if (bucket) bucket.push(v);
    else cells.set(key, [v]);
  }
  return { cellSize, cells, positions, count };
}

interface Candidate {
  readonly index: number;
  readonly distSq: number;
}

/** 점 p의 k 최근접 몸 정점(거리 오름차순, 동률은 인덱스 순). 격자 링을 넓히며 찾는다. */
export function nearestVertices(grid: VertexGrid, x: number, y: number, z: number, k: number): Candidate[] {
  const cx = Math.floor(x / grid.cellSize);
  const cy = Math.floor(y / grid.cellSize);
  const cz = Math.floor(z / grid.cellSize);
  const found: Candidate[] = [];
  const maxRing = 64;
  let ring = 0;
  let settledRing = -1;
  while (ring <= maxRing) {
    for (let ix = cx - ring; ix <= cx + ring; ix += 1) {
      for (let iy = cy - ring; iy <= cy + ring; iy += 1) {
        for (let iz = cz - ring; iz <= cz + ring; iz += 1) {
          const onShell = Math.abs(ix - cx) === ring || Math.abs(iy - cy) === ring || Math.abs(iz - cz) === ring;
          if (!onShell) continue;
          const bucket = grid.cells.get(cellKey(ix, iy, iz));
          if (!bucket) continue;
          for (const v of bucket) {
            const dx = grid.positions[v * 3] - x;
            const dy = grid.positions[v * 3 + 1] - y;
            const dz = grid.positions[v * 3 + 2] - z;
            found.push({ index: v, distSq: dx * dx + dy * dy + dz * dz });
          }
        }
      }
    }
    if (found.length >= k && settledRing < 0) settledRing = ring;
    // k개를 찾은 링의 다음 링까지 확인해야 경계 너머 더 가까운 정점을 놓치지 않는다
    if (settledRing >= 0 && ring >= settledRing + 1) break;
    ring += 1;
  }
  found.sort((a, b) => a.distSq - b.distSq || a.index - b.index);
  return found.slice(0, k);
}

/** 의상 정점마다 몸 정점 k-NN 역거리 가중 매핑 */
export function buildNearestMapping(garmentPositions: Float32Array, body: BodySurface, options: { readonly mask?: Uint8Array; readonly cellSize?: number } = {}): BodyMapping {
  const grid = buildVertexGrid(body.positions, options.cellSize ?? 0.05, options.mask);
  const count = garmentPositions.length / 3;
  const bodyVertex = new Uint32Array(count * MAPPING_K);
  const weight = new Float32Array(count * MAPPING_K);
  for (let v = 0; v < count; v += 1) {
    const near = nearestVertices(grid, garmentPositions[v * 3], garmentPositions[v * 3 + 1], garmentPositions[v * 3 + 2], MAPPING_K);
    if (near.length === 0) continue;
    let total = 0;
    const raw: number[] = [];
    for (const candidate of near) {
      const w = 1 / (Math.sqrt(candidate.distSq) + 1e-4);
      raw.push(w);
      total += w;
    }
    near.forEach((candidate, k) => {
      bodyVertex[v * MAPPING_K + k] = candidate.index;
      weight[v * MAPPING_K + k] = raw[k] / total;
    });
  }
  return { bodyVertex, weight };
}

/** 매핑으로 몸 스킨 웨이트를 상속한다(본별 누적 → 상위 4 → 정규화). */
export function inheritSkinWeights(mapping: BodyMapping, body: BodySurface): { jointIndices: Uint16Array; jointWeights: Float32Array } {
  const count = mapping.bodyVertex.length / MAPPING_K;
  const jointIndices = new Uint16Array(count * 4);
  const jointWeights = new Float32Array(count * 4);
  const accum = new Map<number, number>();
  for (let v = 0; v < count; v += 1) {
    accum.clear();
    for (let k = 0; k < MAPPING_K; k += 1) {
      const w = mapping.weight[v * MAPPING_K + k];
      if (w <= 0) continue;
      const b = mapping.bodyVertex[v * MAPPING_K + k];
      for (let j = 0; j < 4; j += 1) {
        const jw = body.jointWeights[b * 4 + j];
        if (jw <= 0) continue;
        const joint = body.jointIndices[b * 4 + j];
        accum.set(joint, (accum.get(joint) ?? 0) + jw * w);
      }
    }
    const sorted = [...accum.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    let total = 0;
    for (const [, w] of sorted) total += w;
    if (total <= 0) {
      jointWeights[v * 4] = 1;
      continue;
    }
    sorted.forEach(([joint, w], j) => {
      jointIndices[v * 4 + j] = joint;
      jointWeights[v * 4 + j] = w / total;
    });
    // 합이 정확히 1이 되도록 마지막 성분으로 보정(f32 누적 오차)
    let sum = 0;
    for (let j = 0; j < 4; j += 1) sum += jointWeights[v * 4 + j];
    jointWeights[v * 4] += 1 - sum;
  }
  return { jointIndices, jointWeights };
}

/** 체형 morph 델타를 같은 매핑으로 의상에 전파한다(Δu = Σ w_k Δv_k). 전부 0인 morph는 건너뛰지 않는다(이름 집합 유지). */
export function propagateBodyMorphs(garmentVertexCount: number, bodyMorphs: readonly MorphDelta[], mapping: BodyMapping): MorphDelta[] {
  const out: MorphDelta[] = [];
  for (const morph of bodyMorphs) {
    const delta = new Float32Array(garmentVertexCount * 3);
    for (let v = 0; v < garmentVertexCount; v += 1) {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (let k = 0; k < MAPPING_K; k += 1) {
        const w = mapping.weight[v * MAPPING_K + k];
        if (w <= 0) continue;
        const b = mapping.bodyVertex[v * MAPPING_K + k] * 3;
        dx += morph.deltaPositions[b] * w;
        dy += morph.deltaPositions[b + 1] * w;
        dz += morph.deltaPositions[b + 2] * w;
      }
      delta[v * 3] = dx;
      delta[v * 3 + 1] = dy;
      delta[v * 3 + 2] = dz;
    }
    out.push({ name: morph.name, deltaPositions: delta });
  }
  return out;
}

export type VertexPredicate = (vertex: number, region: BodyRegion, x: number, y: number, z: number) => boolean;

/** 영역 집합 + 선택 술어로 몸 정점 마스크(1 = 선택)를 만든다. */
export function selectBodyVertices(body: BodySurface, regions: readonly BodyRegion[], predicate?: VertexPredicate): Uint8Array {
  const count = body.positions.length / 3;
  const regionSet = new Set(regions.map(bodyRegionIndex));
  const mask = new Uint8Array(count);
  for (let v = 0; v < count; v += 1) {
    const region = body.regionOfVertex[v];
    if (!regionSet.has(region)) continue;
    if (predicate && !predicate(v, regionNameOf(region), body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2])) continue;
    mask[v] = 1;
  }
  return mask;
}

function regionNameOf(index: number): BodyRegion {
  return BODY_REGIONS[index] ?? "torso";
}

/** 영역의 y 범위(선택 영역이 없으면 null) */
export function regionBounds(body: BodySurface, regions: readonly BodyRegion[]): { min: [number, number, number]; max: [number, number, number] } | null {
  const regionSet = new Set(regions.map(bodyRegionIndex));
  const count = body.positions.length / 3;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (let v = 0; v < count; v += 1) {
    if (!regionSet.has(body.regionOfVertex[v])) continue;
    any = true;
    for (let k = 0; k < 3; k += 1) {
      const value = body.positions[v * 3 + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }
  return any ? { min, max } : null;
}

/** 영역 정점 중심(없으면 null) */
export function regionCentroid(body: BodySurface, regions: readonly BodyRegion[]): [number, number, number] | null {
  const regionSet = new Set(regions.map(bodyRegionIndex));
  const count = body.positions.length / 3;
  let n = 0;
  const sum: [number, number, number] = [0, 0, 0];
  for (let v = 0; v < count; v += 1) {
    if (!regionSet.has(body.regionOfVertex[v])) continue;
    n += 1;
    sum[0] += body.positions[v * 3];
    sum[1] += body.positions[v * 3 + 1];
    sum[2] += body.positions[v * 3 + 2];
  }
  return n > 0 ? [sum[0] / n, sum[1] / n, sum[2] / n] : null;
}

export interface OffsetShell {
  readonly mesh: MeshBuffers;
  readonly mapping: BodyMapping;
  /** 셸 정점 → 몸 정점 */
  readonly source: Uint32Array;
  readonly triangleCount: number;
}

export interface OffsetShellOptions {
  /** 법선 방향 오프셋(m) */
  readonly offset: number;
  /** 경계 테두리(rim) 생성: 바깥 정점 ↔ 안쪽(offset × innerRatio) 정점을 잇는다 */
  readonly rim?: boolean;
  readonly innerRatio?: number;
  /** UV v에 더할 오프셋(아틀라스 구분) */
  readonly uvShift?: readonly [number, number];
}

/**
 * 마스크된 몸 삼각형(세 정점 모두 선택)을 법선 방향으로 밀어낸 오프셋 셸을 만든다.
 * 스킨 웨이트는 몸 정점에서 그대로 상속하고 매핑은 항등이다. 경계 엣지에는 선택적으로 테두리 쿼드를 붙인다.
 */
export function extractOffsetShell(body: BodySurface, mask: Uint8Array, options: OffsetShellOptions): OffsetShell | null {
  const bodyCount = body.positions.length / 3;
  const remap = new Int32Array(bodyCount).fill(-1);
  const source: number[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const jointIndices: number[] = [];
  const jointWeights: number[] = [];
  const indices: number[] = [];
  const [du, dv] = options.uvShift ?? [0, 0];
  const edgeUse = new Map<number, number>();
  const edgeDir = new Map<number, [number, number]>();
  const addVertex = (b: number, scale: number): number => {
    const index = positions.length / 3;
    positions.push(body.positions[b * 3] + body.normals[b * 3] * scale, body.positions[b * 3 + 1] + body.normals[b * 3 + 1] * scale, body.positions[b * 3 + 2] + body.normals[b * 3 + 2] * scale);
    normals.push(body.normals[b * 3], body.normals[b * 3 + 1], body.normals[b * 3 + 2]);
    uvs.push(body.uvs[b * 2] + du, body.uvs[b * 2 + 1] + dv);
    for (let j = 0; j < 4; j += 1) {
      jointIndices.push(body.jointIndices[b * 4 + j]);
      jointWeights.push(body.jointWeights[b * 4 + j]);
    }
    source.push(b);
    return index;
  };
  let triangleCount = 0;
  for (let t = 0; t < body.indices.length; t += 3) {
    const a = body.indices[t];
    const b = body.indices[t + 1];
    const c = body.indices[t + 2];
    if (mask[a] === 0 || mask[b] === 0 || mask[c] === 0) continue;
    const tri = [a, b, c];
    const local = tri.map((v) => {
      if (remap[v] < 0) remap[v] = addVertex(v, options.offset);
      return remap[v];
    });
    indices.push(local[0], local[1], local[2]);
    triangleCount += 1;
    for (let e = 0; e < 3; e += 1) {
      const u = tri[e];
      const w = tri[(e + 1) % 3];
      const key = u < w ? u * bodyCount + w : w * bodyCount + u;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      if (!edgeDir.has(key)) edgeDir.set(key, [u, w]);
    }
  }
  if (triangleCount === 0) return null;
  if (options.rim ?? true) {
    const inner = options.offset * (options.innerRatio ?? 0.15);
    const innerMap = new Map<number, number>();
    const innerOf = (v: number): number => {
      const cached = innerMap.get(v);
      if (cached !== undefined) return cached;
      const index = addVertex(v, inner);
      innerMap.set(v, index);
      return index;
    };
    const boundary = [...edgeUse.entries()].filter(([, uses]) => uses === 1).map(([key]) => key).sort((x, y) => x - y);
    for (const key of boundary) {
      const [u, w] = edgeDir.get(key) as [number, number];
      // 삼각형 순서(u→w)의 반대로 테두리를 감아 바깥을 향하게 한다
      const ou = remap[u];
      const ow = remap[w];
      const iu = innerOf(u);
      const iw = innerOf(w);
      indices.push(ow, ou, iu, ow, iu, iw);
      triangleCount += 2;
    }
  }
  const sourceArray = Uint32Array.from(source);
  return {
    mesh: {
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint32Array.from(indices),
      jointIndices: Uint16Array.from(jointIndices),
      jointWeights: Float32Array.from(jointWeights),
    },
    mapping: identityMapping(sourceArray),
    source: sourceArray,
    triangleCount,
  };
}

/** 매핑된 몸 정점 법선 기준 부호 거리(음수 = 몸 안쪽). 관통 비율 검증용. */
export function penetrationRatio(garmentPositions: Float32Array, garmentDeltas: Float32Array | null, body: BodySurface, bodyDelta: Float32Array | null, mapping: BodyMapping, tolerance = 2e-3): number {
  const count = garmentPositions.length / 3;
  if (count === 0) return 0;
  let inside = 0;
  for (let v = 0; v < count; v += 1) {
    const b = mapping.bodyVertex[v * MAPPING_K];
    const gx = garmentPositions[v * 3] + (garmentDeltas ? garmentDeltas[v * 3] : 0);
    const gy = garmentPositions[v * 3 + 1] + (garmentDeltas ? garmentDeltas[v * 3 + 1] : 0);
    const gz = garmentPositions[v * 3 + 2] + (garmentDeltas ? garmentDeltas[v * 3 + 2] : 0);
    const bx = body.positions[b * 3] + (bodyDelta ? bodyDelta[b * 3] : 0);
    const by = body.positions[b * 3 + 1] + (bodyDelta ? bodyDelta[b * 3 + 1] : 0);
    const bz = body.positions[b * 3 + 2] + (bodyDelta ? bodyDelta[b * 3 + 2] : 0);
    const d = (gx - bx) * body.normals[b * 3] + (gy - by) * body.normals[b * 3 + 1] + (gz - bz) * body.normals[b * 3 + 2];
    if (d < -tolerance) inside += 1;
  }
  return inside / count;
}
