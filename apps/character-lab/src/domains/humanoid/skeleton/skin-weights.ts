/**
 * 자동 스킨 웨이트: 캡슐 거리 역수(1/(d+ε)^4) 상위 4개 → 정규화 → 라플라시안 스무딩(기본 2회) → 다시 상위 4·정규화.
 * 영역(BODY_REGIONS) 태그가 있으면 영역별 후보 본만 고려해 반대쪽 다리·몸통-팔 간섭을 막는다.
 * 원리: Pinocchio(Baran-Popović 2007)의 캡슐 초기값 + 확산 평활(개념만, 코드 복제 없음). 결정적.
 */
import { BODY_REGIONS, FINGER_BONE_NAMES, type BodyRegion, type HumanoidBoneName, type SkeletonData } from "../../../contracts";
import { closestPointOnSegment, v3Distance, type Vec3 } from "../../../shared/math";

import type { BoneCapsule } from "./skeleton-builder";

export const MAX_INFLUENCES = 4;

export interface SkinWeights {
  /** 정점당 4(본 인덱스 = skeleton.bones 순서) */
  readonly jointIndices: Uint16Array;
  /** 정점당 4, 합 1 */
  readonly jointWeights: Float32Array;
}

/** CSR 인접(무방향, 중복 없음, 열 오름차순) */
export interface VertexAdjacency {
  readonly rowPtr: Uint32Array;
  readonly cols: Uint32Array;
}

export interface SkinWeightOptions {
  /** 정점별 영역(BODY_REGIONS 인덱스, 255 = 없음) */
  readonly regions?: Uint8Array;
  /** 영역 → 후보 본 이름(없거나 null이면 전체) */
  readonly candidates?: (region: number) => readonly string[] | null;
  readonly adjacency?: VertexAdjacency;
  /** 기본 2 */
  readonly smoothingIterations?: number;
  /** 기본 0.5 */
  readonly smoothingLambda?: number;
  /** 거리 역수의 ε(m), 기본 0.01 */
  readonly epsilon?: number;
}

/** 쿼드 면 배열에서 정점 인접을 만든다(위치 토폴로지). */
export function buildAdjacency(vertexCount: number, quadFaces: Uint32Array): VertexAdjacency {
  const sets: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let f = 0; f < quadFaces.length; f += 4) {
    for (let i = 0; i < 4; i += 1) {
      const a = quadFaces[f + i];
      const b = quadFaces[f + ((i + 1) % 4)];
      sets[a].add(b);
      sets[b].add(a);
    }
  }
  const rowPtr = new Uint32Array(vertexCount + 1);
  let total = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    rowPtr[v] = total;
    total += sets[v].size;
  }
  rowPtr[vertexCount] = total;
  const cols = new Uint32Array(total);
  for (let v = 0; v < vertexCount; v += 1) {
    const sorted = [...sets[v]].sort((x, y) => x - y);
    cols.set(sorted, rowPtr[v]);
  }
  return { rowPtr, cols };
}

const LEFT_FINGERS = FINGER_BONE_NAMES.filter((n) => n.startsWith("left"));
const RIGHT_FINGERS = FINGER_BONE_NAMES.filter((n) => n.startsWith("right"));

/** 영역별 후보 본(기본 정책) */
export const REGION_BONE_CANDIDATES: Readonly<Record<BodyRegion, readonly HumanoidBoneName[]>> = {
  head: ["head", "neck"],
  neck: ["neck", "head", "upperChest"],
  torso: ["spine", "chest", "upperChest", "hips", "neck", "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm"],
  hips: ["hips", "spine", "leftUpperLeg", "rightUpperLeg"],
  leftArm: ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "upperChest"],
  rightArm: ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand", "upperChest"],
  leftHand: ["leftLowerArm", "leftHand", ...LEFT_FINGERS],
  rightHand: ["rightLowerArm", "rightHand", ...RIGHT_FINGERS],
  leftLeg: ["hips", "leftUpperLeg", "leftLowerLeg", "leftFoot"],
  rightLeg: ["hips", "rightUpperLeg", "rightLowerLeg", "rightFoot"],
  leftFoot: ["leftLowerLeg", "leftFoot", "leftToes"],
  rightFoot: ["rightLowerLeg", "rightFoot", "rightToes"],
};

export function defaultCandidates(region: number): readonly string[] | null {
  const name = BODY_REGIONS[region];
  return name ? REGION_BONE_CANDIDATES[name] : null;
}

interface SparseWeights {
  /** 정점별 (본 인덱스 → 가중치) */
  readonly rows: Map<number, number>[];
}

function topKNormalized(row: Map<number, number>, k: number): Map<number, number> {
  const entries = [...row.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k);
  let sum = 0;
  for (const [, w] of entries) sum += w;
  const out = new Map<number, number>();
  if (sum <= 0) return out;
  for (const [bone, w] of entries) out.set(bone, w / sum);
  return out;
}

function capsuleDistanceOutside(p: Vec3, c: BoneCapsule): number {
  const q = closestPointOnSegment(p, c.a, c.b);
  return Math.max(0, v3Distance(p, q) - c.radius);
}

/** 라플라시안 스무딩 1회: w' = (1−λ)w + λ·mean(이웃) */
function smoothOnce(weights: SparseWeights, adjacency: VertexAdjacency, lambda: number): SparseWeights {
  const rows = weights.rows.map((row, v) => {
    const start = adjacency.rowPtr[v];
    const end = adjacency.rowPtr[v + 1];
    const degree = end - start;
    if (degree === 0) return new Map(row);
    const out = new Map<number, number>();
    for (const [bone, w] of row) out.set(bone, (1 - lambda) * w);
    const share = lambda / degree;
    for (let k = start; k < end; k += 1) {
      for (const [bone, w] of weights.rows[adjacency.cols[k]]) out.set(bone, (out.get(bone) ?? 0) + share * w);
    }
    return out;
  });
  return { rows };
}

/**
 * 스펙 공개 API. positions는 정점 ×3(용접 토폴로지), capsules는 월드 캡슐, 본 인덱스는 skeleton.bones 순서.
 */
export function computeSkinWeights(positions: Float32Array, skeleton: SkeletonData, capsules: readonly BoneCapsule[], options: SkinWeightOptions = {}): SkinWeights {
  const vertexCount = positions.length / 3;
  const boneIndex = new Map<string, number>();
  skeleton.bones.forEach((bone, index) => boneIndex.set(bone.name, index));
  const epsilon = options.epsilon ?? 0.01;
  const candidatesOf = options.candidates ?? defaultCandidates;
  const capsuleByBone = new Map<string, BoneCapsule>();
  for (const capsule of capsules) capsuleByBone.set(capsule.bone, capsule);
  const allNames = capsules.map((c) => c.bone);

  const rows: Map<number, number>[] = [];
  for (let v = 0; v < vertexCount; v += 1) {
    const p: Vec3 = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const region = options.regions ? options.regions[v] : 255;
    const names = (options.regions ? candidatesOf(region) : null) ?? allNames;
    const row = new Map<number, number>();
    for (const name of names) {
      const capsule = capsuleByBone.get(name);
      const index = boneIndex.get(name);
      if (!capsule || index === undefined) continue;
      const d = capsuleDistanceOutside(p, capsule);
      row.set(index, 1 / Math.pow(d + epsilon, 4));
    }
    rows.push(topKNormalized(row, MAX_INFLUENCES));
  }

  let sparse: SparseWeights = { rows };
  const iterations = options.smoothingIterations ?? 2;
  if (options.adjacency && iterations > 0) {
    const lambda = options.smoothingLambda ?? 0.5;
    for (let i = 0; i < iterations; i += 1) sparse = smoothOnce(sparse, options.adjacency, lambda);
    sparse = { rows: sparse.rows.map((row) => topKNormalized(row, MAX_INFLUENCES)) };
  }

  const jointIndices = new Uint16Array(vertexCount * 4);
  const jointWeights = new Float32Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v += 1) {
    const entries = [...sparse.rows[v].entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (entries.length === 0) throw new Error(`정점 ${v}에 스킨 웨이트 후보 본이 없습니다.`);
    // 합이 정확히 1이 되도록 마지막 항에 잔차를 넣는다(float32 누적 오차 방지).
    let acc = 0;
    entries.forEach(([bone, w], i) => {
      jointIndices[v * 4 + i] = bone;
      if (i === entries.length - 1) {
        jointWeights[v * 4 + i] = Math.max(0, Math.fround(1 - acc));
      } else {
        const r = Math.fround(w);
        jointWeights[v * 4 + i] = r;
        acc += r;
      }
    });
  }
  return { jointIndices, jointWeights };
}

/** 인접 정점 간 가중치 차의 합(스무딩 효과 측정용) */
export function weightRoughness(weights: SkinWeights, adjacency: VertexAdjacency): number {
  const vertexCount = weights.jointIndices.length / 4;
  const dense = (v: number): Map<number, number> => {
    const m = new Map<number, number>();
    for (let i = 0; i < 4; i += 1) {
      const w = weights.jointWeights[v * 4 + i];
      if (w > 0) m.set(weights.jointIndices[v * 4 + i], (m.get(weights.jointIndices[v * 4 + i]) ?? 0) + w);
    }
    return m;
  };
  let total = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    const a = dense(v);
    for (let k = adjacency.rowPtr[v]; k < adjacency.rowPtr[v + 1]; k += 1) {
      const u = adjacency.cols[k];
      if (u < v) continue;
      const b = dense(u);
      const bones = new Set([...a.keys(), ...b.keys()]);
      for (const bone of bones) total += Math.abs((a.get(bone) ?? 0) - (b.get(bone) ?? 0));
    }
  }
  return total;
}

/** 용접 정점 가중치를 분할 정점으로 복사 */
export function expandSkinWeights(weights: SkinWeights, vertexSource: Uint32Array): SkinWeights {
  const jointIndices = new Uint16Array(vertexSource.length * 4);
  const jointWeights = new Float32Array(vertexSource.length * 4);
  for (let i = 0; i < vertexSource.length; i += 1) {
    const src = vertexSource[i] * 4;
    for (let c = 0; c < 4; c += 1) {
      jointIndices[i * 4 + c] = weights.jointIndices[src + c];
      jointWeights[i * 4 + c] = weights.jointWeights[src + c];
    }
  }
  return { jointIndices, jointWeights };
}

/** 모든 정점을 본 하나에 100% 바인딩 */
export function rigidSkinWeights(vertexCount: number, boneIndex: number): SkinWeights {
  const jointIndices = new Uint16Array(vertexCount * 4);
  const jointWeights = new Float32Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v += 1) {
    jointIndices[v * 4] = boneIndex;
    jointWeights[v * 4] = 1;
  }
  return { jointIndices, jointWeights };
}

/** 정점별로 본을 고르는 바인딩(치아 상/하처럼 두 본으로 나뉠 때) */
export function selectSkinWeights(positions: Float32Array, pick: (p: Vec3, index: number) => number): SkinWeights {
  const vertexCount = positions.length / 3;
  const jointIndices = new Uint16Array(vertexCount * 4);
  const jointWeights = new Float32Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v += 1) {
    jointIndices[v * 4] = pick([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], v);
    jointWeights[v * 4] = 1;
  }
  return { jointIndices, jointWeights };
}
