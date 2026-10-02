/**
 * 스키닝·morph를 반영한 pick. Babylon `scene.pickWithRay`는 bind 포즈 삼각형을 쓰므로(포즈를 바꿔도 이전 위치가 맞는다)
 * 메시마다 `getPositionData(applySkeleton, applyMorph)`로 포즈가 적용된 위치를 얻어 `render/triangle-pick.ts`(순수)로
 * 레이캐스트한다. 메시별 캐시는 본 행렬·morph influence 스냅샷이 같으면 재사용하므로, 포즈가 안 바뀐 드로잉 중에는 재계산이 없고
 * 헤어 물리처럼 일부 본만 움직이는 경우에도 몸 메시는 다시 스키닝하지 않는다.
 *
 * 공간 규약: 스킨된 위치는 메시 로컬 공간이며 월드 = 메시 월드 행렬 × 위치(Babylon 셰이더 `world * skin * position`과 같다).
 * 광선은 메시 로컬로 옮겨(정규화하지 않아 t가 월드 거리와 같다) 검사하고 교차점·법선은 월드로 되돌린다.
 */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { faceNormal, interpolateUv, raycastTriangles, computeGroupBoxes, rayIntersectsBox, triangleVertices } from "../triangle-pick";

import { fromVector3, toVector3 } from "./convert";

import type { Vec3 } from "../../contracts";
import type { IndexArray, TriangleHit } from "../triangle-pick";
import type { Ray } from "@babylonjs/core/Culling/ray.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Node } from "@babylonjs/core/node.js";

interface MeshPickCache {
  /** 스킨 행렬 스냅샷(스킨이 없으면 null) */
  skeletonMatrices: Float32Array | null;
  morphInfluences: number[];
  positions: Float32Array;
  groupBoxes: Float32Array;
  /** 메시 전체 AABB(묶음 AABB의 합) */
  overallBox: Float32Array;
  readonly indices: IndexArray;
  readonly uvs: Float32Array | null;
}

const caches = new WeakMap<Mesh, MeshPickCache>();

/** 재계산 횟수(테스트·진단) */
export const pickStats = { recomputes: 0 };

function morphSnapshot(mesh: Mesh): number[] {
  const manager = mesh.morphTargetManager;
  if (!manager) return [];
  const out: number[] = [];
  for (let i = 0; i < manager.numTargets; i += 1) out.push(manager.getTarget(i).influence);
  return out;
}

function sameNumbers(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function overallBoxOf(groupBoxes: Float32Array): Float32Array {
  const box = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let g = 0; g < groupBoxes.length; g += 6) {
    for (let axis = 0; axis < 3; axis += 1) {
      box[axis] = Math.min(box[axis] ?? Infinity, groupBoxes[g + axis] ?? Infinity);
      box[3 + axis] = Math.max(box[3 + axis] ?? -Infinity, groupBoxes[g + 3 + axis] ?? -Infinity);
    }
  }
  return box;
}

function toIndexArray(source: ArrayLike<number> | null): IndexArray {
  if (source === null) return [];
  if (source instanceof Uint16Array || source instanceof Uint32Array) return source;
  return Array.from(source);
}

/** 캐시를 현재 포즈에 맞춘다. 스냅샷이 같으면 재사용, 메시에 위치 데이터가 없으면 null. */
function ensureCache(mesh: Mesh): MeshPickCache | null {
  const skeleton = mesh.skeleton;
  const matrices = skeleton ? skeleton.getTransformMatrices(mesh) : null;
  const influences = morphSnapshot(mesh);
  const cached = caches.get(mesh);
  if (cached && sameNumbers(cached.morphInfluences, influences) && (matrices === null ? cached.skeletonMatrices === null : cached.skeletonMatrices !== null && sameNumbers(cached.skeletonMatrices, matrices))) {
    return cached;
  }
  const posed = mesh.getPositionData(Boolean(skeleton), Boolean(mesh.morphTargetManager));
  if (!posed) return null;
  const positions = posed instanceof Float32Array ? posed : Float32Array.from(posed);
  const indices = cached?.indices ?? toIndexArray(mesh.getIndices());
  const uvData = cached ? cached.uvs : mesh.getVerticesData("uv");
  const uvs = uvData ? (uvData instanceof Float32Array ? uvData : Float32Array.from(uvData)) : null;
  const groupBoxes = computeGroupBoxes(positions, indices);
  const next: MeshPickCache = {
    skeletonMatrices: matrices ? Float32Array.from(matrices) : null,
    morphInfluences: influences,
    positions,
    groupBoxes,
    overallBox: overallBoxOf(groupBoxes),
    indices,
    uvs,
  };
  caches.set(mesh, next);
  pickStats.recomputes += 1;
  return next;
}

/** 노드 조상부터 순서대로 월드 행렬을 강제 갱신한다(렌더 루프 밖에서도 최신 변환을 쓰기 위해). */
function syncWorldMatrix(node: Node): void {
  const chain: Node[] = [];
  for (let cursor: Node | null = node; cursor; cursor = cursor.parent) chain.push(cursor);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const item = chain[i] as Node & { computeWorldMatrix?: (force?: boolean) => unknown };
    item.computeWorldMatrix?.(true);
  }
}

/** 맞은 삼각형의 월드 위치·UV(투영 페인트가 UV 한 텍셀의 월드 크기를 추정하는 데 쓴다) */
export interface PickedTriangle {
  readonly world: readonly [Vec3, Vec3, Vec3];
  readonly uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
}

export interface MeshPickHit {
  readonly mesh: Mesh;
  /** 월드 거리 */
  readonly distance: number;
  readonly uv: readonly [number, number];
  readonly worldPosition: Vec3;
  readonly worldNormal: Vec3;
  /** 맞은 삼각형(UV가 없는 메시면 null) */
  readonly triangle: PickedTriangle | null;
}

/** 후보 메시들 중 광선(월드)에 가장 가까이 맞는 메시와 교차 정보. 스킨 행렬은 호출 전에 `skeleton.prepare(true)`로 갱신한다. */
export function pickMeshes(ray: Ray, meshes: readonly Mesh[]): MeshPickHit | null {
  let best: MeshPickHit | null = null;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() === 0) continue;
    const cache = ensureCache(mesh);
    if (!cache) continue;
    syncWorldMatrix(mesh);
    const world = mesh.getWorldMatrix();
    const inverse = Matrix.Invert(world);
    const origin = Vector3.TransformCoordinates(ray.origin, inverse);
    const direction = Vector3.TransformNormal(ray.direction, inverse);
    const local = { origin: fromVector3(origin), direction: fromVector3(direction) };
    const limit = best ? best.distance : Number.POSITIVE_INFINITY;
    if (!rayIntersectsBox(local, cache.overallBox, 0, limit)) continue;
    const hit: TriangleHit | null = raycastTriangles(cache.positions, cache.indices, cache.groupBoxes, local, limit);
    if (!hit) continue;
    const localPoint = origin.add(direction.scale(hit.t));
    const worldPoint = Vector3.TransformCoordinates(localPoint, world);
    const distance = Vector3.Distance(worldPoint, ray.origin);
    if (best && distance >= best.distance) continue;
    const [a, b, c] = triangleVertices(cache.positions, cache.indices, hit.triangle);
    const toWorld = (p: Vec3): Vec3 => fromVector3(Vector3.TransformCoordinates(toVector3(p), world));
    const normal = faceNormal(toWorld(a), toWorld(b), toWorld(c)) ?? [0, 0, 1];
    // 광선을 마주 보는 쪽으로 법선을 돌린다(양면 교차)
    const facing = normal[0] * ray.direction.x + normal[1] * ray.direction.y + normal[2] * ray.direction.z > 0;
    const uvAt = (k: number): readonly [number, number] => {
      const index = (cache.indices[hit.triangle * 3 + k] ?? 0) * 2;
      return [cache.uvs?.[index] ?? 0, cache.uvs?.[index + 1] ?? 0];
    };
    best = {
      mesh,
      distance,
      uv: interpolateUv(cache.uvs, cache.indices, hit),
      worldPosition: fromVector3(worldPoint),
      worldNormal: facing ? [-normal[0], -normal[1], -normal[2]] : normal,
      triangle: cache.uvs ? { world: [toWorld(a), toWorld(b), toWorld(c)], uv: [uvAt(0), uvAt(1), uvAt(2)] } : null,
    };
  }
  return best;
}
