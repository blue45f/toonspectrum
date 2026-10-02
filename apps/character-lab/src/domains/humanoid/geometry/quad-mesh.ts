/**
 * 쿼드 케이지 자료구조와 빌더.
 *
 * - 위치 토폴로지(`faces`)와 UV 토폴로지(`uvFaces`)를 분리한다. 위치 메시는 닫힌(수밀) 다양체이고
 *   UV 메시는 섬(island) 경계를 가진다. 둘은 면 수가 같고 면 i의 네 코너가 1:1 대응한다.
 * - 빌더는 방향 간선(a→b) 장부를 유지해 모든 면이 일관된 바깥 방향 감김(CCW)을 갖도록 강제한다.
 *   같은 방향 간선이 두 번 나오면 즉시 throw(무음 손상 금지).
 * - 브리지·캡·튜브 헬퍼가 T/Y 접합(어깨·가랑이)과 폴 캡을 만든다. 모든 연산은 결정적이다.
 */
import type { Vec3 } from "../../../shared/math";

export interface QuadMesh {
  /** 정점 ×3 */
  readonly positions: Float32Array;
  /** 면 ×4(위치 정점 인덱스) */
  readonly faces: Uint32Array;
  /** UV 정점 ×2 */
  readonly uvs: Float32Array;
  /** 면 ×4(UV 정점 인덱스) */
  readonly uvFaces: Uint32Array;
  /** 정점별 영역 태그(BODY_REGIONS 인덱스 등, 없으면 255) */
  readonly regions: Uint8Array;
}

export const NO_REGION = 255;

const EDGE_KEY_BASE = 0x200000;

function edgeKey(a: number, b: number): number {
  return a * EDGE_KEY_BASE + b;
}

export interface TubeOptions {
  /** (ringIndex j, column k) 면을 건너뛴다(구멍 내기). j는 아래쪽 링 인덱스. */
  readonly skip?: (ringIndex: number, column: number) => boolean;
}

export interface AlignedLoops {
  /** 재정렬된 A 루프(길이 n). a[k]가 b[k]와 짝이다. */
  readonly a: readonly number[];
  readonly b: readonly number[];
  /** true면 사각형 순서가 (a[k], a[k+1], b[k+1], b[k]), false면 (b[k], b[k+1], a[k+1], a[k]) */
  readonly aFirst: boolean;
}

export class QuadMeshBuilder {
  private readonly positions: number[] = [];
  private readonly regions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly faces: number[] = [];
  private readonly uvFaces: number[] = [];
  private readonly directed = new Set<number>();

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get faceCount(): number {
    return this.faces.length / 4;
  }

  addVertex(p: Vec3, region: number = NO_REGION): number {
    const index = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.regions.push(region);
    return index;
  }

  addVertices(points: readonly Vec3[], region: number = NO_REGION): number[] {
    return points.map((p) => this.addVertex(p, region));
  }

  addUv(u: number, v: number): number {
    const index = this.uvs.length / 2;
    this.uvs.push(u, v);
    return index;
  }

  position(index: number): Vec3 {
    return [this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2]];
  }

  setPosition(index: number, p: Vec3): void {
    this.positions[index * 3] = p[0];
    this.positions[index * 3 + 1] = p[1];
    this.positions[index * 3 + 2] = p[2];
  }

  hasDirectedEdge(a: number, b: number): boolean {
    return this.directed.has(edgeKey(a, b));
  }

  /** 방향 간선 충돌이 없는 방향으로 사각형을 추가한다(둘 다 충돌하면 throw). */
  addQuad(v: readonly [number, number, number, number], uv: readonly [number, number, number, number]): void {
    if (this.canAdd(v)) {
      this.pushQuad(v, uv);
      return;
    }
    const flippedV: [number, number, number, number] = [v[3], v[2], v[1], v[0]];
    const flippedUv: [number, number, number, number] = [uv[3], uv[2], uv[1], uv[0]];
    if (this.canAdd(flippedV)) {
      this.pushQuad(flippedV, flippedUv);
      return;
    }
    throw new Error(`쿼드 (${v.join(",")})를 어느 방향으로도 추가할 수 없습니다(방향 간선 충돌).`);
  }

  /** 주어진 방향 그대로 추가한다(충돌 시 throw). 튜브처럼 방향이 이미 결정된 경우에 쓴다. */
  addQuadExact(v: readonly [number, number, number, number], uv: readonly [number, number, number, number]): void {
    if (!this.canAdd(v)) {
      throw new Error(`쿼드 (${v.join(",")})가 기존 방향 간선과 충돌합니다.`);
    }
    this.pushQuad(v, uv);
  }

  /**
   * 링 배열을 튜브로 잇는다. rings[j]는 n개의 정점, uvRows[j]는 n+1개(마지막은 u=1 솔기 복제)의 UV.
   * 감김 방향은 첫 번째 사각형의 기하(바깥 방향)로 결정하고 튜브 전체에 같은 방향을 쓴다.
   * 이미 방향 간선이 있는 링(브리지된 링 등)에서 시작하면 그 방향을 우선한다.
   */
  addTube(rings: readonly (readonly number[])[], uvRows: readonly (readonly number[])[], options: TubeOptions = {}): void {
    if (rings.length < 2) return;
    const n = rings[0].length;
    let outward = this.resolveTubeOrientation(rings, uvRows, n);
    for (let j = 0; j + 1 < rings.length; j += 1) {
      const lower = rings[j];
      const upper = rings[j + 1];
      const uvLower = uvRows[j];
      const uvUpper = uvRows[j + 1];
      if (lower.length !== n || upper.length !== n || uvLower.length !== n + 1 || uvUpper.length !== n + 1) {
        throw new Error(`튜브 링 길이가 맞지 않습니다(ring ${j}).`);
      }
      for (let k = 0; k < n; k += 1) {
        if (options.skip?.(j, k)) continue;
        const k1 = (k + 1) % n;
        const v: [number, number, number, number] = outward
          ? [lower[k], lower[k1], upper[k1], upper[k]]
          : [upper[k], upper[k1], lower[k1], lower[k]];
        const uv: [number, number, number, number] = outward
          ? [uvLower[k], uvLower[k + 1], uvUpper[k + 1], uvUpper[k]]
          : [uvUpper[k], uvUpper[k + 1], uvLower[k + 1], uvLower[k]];
        if (!this.canAdd(v)) {
          // 첫 사각형에서 결정한 방향이 기존 간선과 충돌하면 반대 방향으로 전환한다(한 번만).
          outward = !outward;
          const flippedV: [number, number, number, number] = [v[3], v[2], v[1], v[0]];
          const flippedUv: [number, number, number, number] = [uv[3], uv[2], uv[1], uv[0]];
          this.addQuadExact(flippedV, flippedUv);
          continue;
        }
        this.pushQuad(v, uv);
      }
    }
  }

  /**
   * 짝수 링을 폴 중심 정점 하나로 닫는다(n/2개의 사각형: center, r[2i], r[2i+1], r[2i+2]).
   * uvRing은 n+1개(원형 섬: 마지막은 첫 번째와 같은 위치의 복제), centerUv는 섬 중심.
   */
  addPoleCap(ring: readonly number[], center: number, uvRing: readonly number[], centerUv: number): void {
    const n = ring.length;
    if (n % 2 !== 0) throw new Error(`폴 캡은 짝수 링만 지원합니다(n=${n}).`);
    for (let i = 0; i < n; i += 2) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const c = ring[(i + 2) % n];
      this.addQuad([center, a, b, c], [centerUv, uvRing[i], uvRing[i + 1], uvRing[i + 2]]);
    }
  }

  /**
   * 두 루프의 짝을 맞춘다. B는 고정하고 A를 (필요하면) 뒤집고 회전해 간선 방향이 일관되고
   * 정점 간 거리 합이 최소가 되게 한다. 두 루프 모두 기존 면의 경계여야 한다.
   */
  alignLoops(loopA: readonly number[], loopB: readonly number[]): AlignedLoops {
    const n = loopA.length;
    if (loopB.length !== n) throw new Error(`루프 길이가 다릅니다(${n} vs ${loopB.length}).`);
    const dirB = this.loopDirection(loopB);
    const dirA = this.loopDirection(loopA);
    // b[k]→b[k+1]이 기존 방향이면 사각형 (a[k], a[k+1], b[k+1], b[k]): a[k]→a[k+1]은 기존과 반대여야 한다.
    const aFirst = dirB > 0;
    const wantAForward = !aFirst;
    const aOrdered = (dirA > 0) === wantAForward ? [...loopA] : [...loopA].reverse();
    let bestOffset = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let s = 0; s < n; s += 1) {
      let cost = 0;
      for (let k = 0; k < n; k += 1) {
        const pa = this.position(aOrdered[(k + s) % n]);
        const pb = this.position(loopB[k]);
        const dx = pa[0] - pb[0];
        const dy = pa[1] - pb[1];
        const dz = pa[2] - pb[2];
        cost += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      if (cost < bestCost - 1e-12) {
        bestCost = cost;
        bestOffset = s;
      }
    }
    const a: number[] = [];
    for (let k = 0; k < n; k += 1) a.push(aOrdered[(k + bestOffset) % n]);
    return { a, b: [...loopB], aFirst };
  }

  /** alignLoops 결과로 브리지 사각형을 추가한다. uvA/uvB는 n+1개(솔기 복제). */
  addBridge(aligned: AlignedLoops, uvA: readonly number[], uvB: readonly number[]): void {
    const n = aligned.a.length;
    if (uvA.length !== n + 1 || uvB.length !== n + 1) throw new Error("브리지 UV 행 길이는 n+1이어야 합니다.");
    for (let k = 0; k < n; k += 1) {
      const k1 = (k + 1) % n;
      const a0 = aligned.a[k];
      const a1 = aligned.a[k1];
      const b0 = aligned.b[k];
      const b1 = aligned.b[k1];
      if (aligned.aFirst) {
        this.addQuadExact([a0, a1, b1, b0], [uvA[k], uvA[k + 1], uvB[k + 1], uvB[k]]);
      } else {
        this.addQuadExact([b0, b1, a1, a0], [uvB[k], uvB[k + 1], uvA[k + 1], uvA[k]]);
      }
    }
  }

  /** 루프 간선이 기존 면에서 쓰인 방향: +1(l[k]→l[k+1]), -1(반대). 면이 없으면 throw. */
  loopDirection(loop: readonly number[]): 1 | -1 {
    const n = loop.length;
    let forward = 0;
    let backward = 0;
    for (let k = 0; k < n; k += 1) {
      const a = loop[k];
      const b = loop[(k + 1) % n];
      if (this.hasDirectedEdge(a, b)) forward += 1;
      if (this.hasDirectedEdge(b, a)) backward += 1;
    }
    if (forward === n && backward === 0) return 1;
    if (backward === n && forward === 0) return -1;
    throw new Error(`루프의 기존 간선 방향이 일관되지 않습니다(forward=${forward}, backward=${backward}, n=${n}).`);
  }

  /** 사용되지 않은 정점·UV를 제거하고 인덱스를 재배치해 QuadMesh를 만든다. */
  build(): QuadMesh {
    return this.buildWithMap().mesh;
  }

  /** build()와 같되 빌더 정점 인덱스 → 결과 인덱스 맵(미사용 정점은 -1)을 함께 돌려준다(랜드마크 변환용). */
  buildWithMap(): { readonly mesh: QuadMesh; readonly vertexMap: Int32Array; readonly uvMap: Int32Array } {
    const vertexCount = this.positions.length / 3;
    const uvCount = this.uvs.length / 2;
    const usedVertex = new Uint8Array(vertexCount);
    const usedUv = new Uint8Array(uvCount);
    for (let i = 0; i < this.faces.length; i += 1) {
      usedVertex[this.faces[i]] = 1;
      usedUv[this.uvFaces[i]] = 1;
    }
    const vertexMap = new Int32Array(vertexCount).fill(-1);
    const uvMap = new Int32Array(uvCount).fill(-1);
    let nextVertex = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      if (usedVertex[i]) {
        vertexMap[i] = nextVertex;
        nextVertex += 1;
      }
    }
    let nextUv = 0;
    for (let i = 0; i < uvCount; i += 1) {
      if (usedUv[i]) {
        uvMap[i] = nextUv;
        nextUv += 1;
      }
    }
    const positions = new Float32Array(nextVertex * 3);
    const regions = new Uint8Array(nextVertex);
    for (let i = 0; i < vertexCount; i += 1) {
      const mapped = vertexMap[i];
      if (mapped < 0) continue;
      positions[mapped * 3] = this.positions[i * 3];
      positions[mapped * 3 + 1] = this.positions[i * 3 + 1];
      positions[mapped * 3 + 2] = this.positions[i * 3 + 2];
      regions[mapped] = this.regions[i];
    }
    const uvs = new Float32Array(nextUv * 2);
    for (let i = 0; i < uvCount; i += 1) {
      const mapped = uvMap[i];
      if (mapped < 0) continue;
      uvs[mapped * 2] = this.uvs[i * 2];
      uvs[mapped * 2 + 1] = this.uvs[i * 2 + 1];
    }
    const faces = new Uint32Array(this.faces.length);
    const uvFaces = new Uint32Array(this.uvFaces.length);
    for (let i = 0; i < this.faces.length; i += 1) {
      faces[i] = vertexMap[this.faces[i]];
      uvFaces[i] = uvMap[this.uvFaces[i]];
    }
    return { mesh: { positions, faces, uvs, uvFaces, regions }, vertexMap, uvMap };
  }

  private canAdd(v: readonly [number, number, number, number]): boolean {
    for (let i = 0; i < 4; i += 1) {
      const a = v[i];
      const b = v[(i + 1) % 4];
      if (a === b) return false;
      if (this.directed.has(edgeKey(a, b))) return false;
    }
    return true;
  }

  private pushQuad(v: readonly [number, number, number, number], uv: readonly [number, number, number, number]): void {
    for (let i = 0; i < 4; i += 1) this.directed.add(edgeKey(v[i], v[(i + 1) % 4]));
    this.faces.push(v[0], v[1], v[2], v[3]);
    this.uvFaces.push(uv[0], uv[1], uv[2], uv[3]);
  }

  private resolveTubeOrientation(rings: readonly (readonly number[])[], uvRows: readonly (readonly number[])[], n: number): boolean {
    void uvRows;
    // 1) 어느 링이든 기존 간선이 있으면 그 방향을 따른다.
    for (let j = 0; j < rings.length; j += 1) {
      const ring = rings[j];
      for (let k = 0; k < n; k += 1) {
        const a = ring[k];
        const b = ring[(k + 1) % n];
        if (this.hasDirectedEdge(a, b)) {
          // 하단 링 간선이 a→b로 이미 쓰였다면 우리 면은 b→a 방향, 즉 (lower[k], lower[k1], ...)가 아니다.
          return j === 0 ? false : true;
        }
        if (this.hasDirectedEdge(b, a)) {
          return j === 0 ? true : false;
        }
      }
    }
    // 2) 기하로 결정: 첫 사각형 법선이 두 링 중심에서 바깥을 향하면 outward=true.
    const lower = rings[0];
    const upper = rings[1];
    const center = this.ringCentroid(lower, upper);
    const p0 = this.position(lower[0]);
    const p1 = this.position(lower[1 % n]);
    const p3 = this.position(upper[0]);
    const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2: Vec3 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    const normal: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const p2 = this.position(upper[1 % n]);
    const faceCenter: Vec3 = [
      (p0[0] + p1[0] + p2[0] + p3[0]) / 4 - center[0],
      (p0[1] + p1[1] + p2[1] + p3[1]) / 4 - center[1],
      (p0[2] + p1[2] + p2[2] + p3[2]) / 4 - center[2],
    ];
    const dot = normal[0] * faceCenter[0] + normal[1] * faceCenter[1] + normal[2] * faceCenter[2];
    return dot >= 0;
  }

  private ringCentroid(a: readonly number[], b: readonly number[]): Vec3 {
    let x = 0;
    let y = 0;
    let z = 0;
    const total = a.length + b.length;
    for (const index of [...a, ...b]) {
      x += this.positions[index * 3];
      y += this.positions[index * 3 + 1];
      z += this.positions[index * 3 + 2];
    }
    return [x / total, y / total, z / total];
  }
}

export interface EdgeStats {
  /** 서로 다른 무방향 간선 수 */
  readonly edgeCount: number;
  /** 면이 2개가 아닌 간선 수(0이면 닫힌 다양체) */
  readonly nonManifoldEdges: number;
  /** 같은 방향으로 두 번 쓰인 간선 수(0이면 일관된 감김) */
  readonly inconsistentEdges: number;
  /** 면이 1개뿐인 경계 간선 수 */
  readonly boundaryEdges: number;
  /** 면에 쓰이지 않은 정점 수 */
  readonly isolatedVertices: number;
}

/** 위치 토폴로지 간선 통계(테스트·검증용). */
export function quadMeshEdgeStats(mesh: Pick<QuadMesh, "positions" | "faces">): EdgeStats {
  const vertexCount = mesh.positions.length / 3;
  const forward = new Map<number, number>();
  const used = new Uint8Array(vertexCount);
  let inconsistent = 0;
  for (let f = 0; f < mesh.faces.length; f += 4) {
    for (let i = 0; i < 4; i += 1) {
      const a = mesh.faces[f + i];
      const b = mesh.faces[f + ((i + 1) % 4)];
      used[a] = 1;
      const key = edgeKey(a, b);
      const count = (forward.get(key) ?? 0) + 1;
      if (count > 1) inconsistent += 1;
      forward.set(key, count);
    }
  }
  const undirected = new Map<number, number>();
  for (const [key, count] of forward) {
    const a = Math.floor(key / EDGE_KEY_BASE);
    const b = key % EDGE_KEY_BASE;
    const ukey = a < b ? edgeKey(a, b) : edgeKey(b, a);
    undirected.set(ukey, (undirected.get(ukey) ?? 0) + count);
  }
  let nonManifold = 0;
  let boundary = 0;
  for (const count of undirected.values()) {
    if (count !== 2) nonManifold += 1;
    if (count === 1) boundary += 1;
  }
  let isolated = 0;
  for (let i = 0; i < vertexCount; i += 1) if (!used[i]) isolated += 1;
  return {
    edgeCount: undirected.size,
    nonManifoldEdges: nonManifold,
    inconsistentEdges: inconsistent,
    boundaryEdges: boundary,
    isolatedVertices: isolated,
  };
}

/** 정점 i의 x를 뒤집은 위치에 있는 정점 j(허용 오차 내)를 찾는다. 없으면 -1. 결정적. */
export function mirrorMapX(positions: Float32Array, eps = 1e-5): Int32Array {
  const count = positions.length / 3;
  const buckets = new Map<string, number[]>();
  const keyOf = (x: number, y: number, z: number): string =>
    `${Math.round(x / eps / 4)}:${Math.round(y / eps / 4)}:${Math.round(z / eps / 4)}`;
  for (let i = 0; i < count; i += 1) {
    const key = keyOf(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  const map = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i += 1) {
    const x = -positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    let best = -1;
    let bestDist = eps;
    // 양자화 경계를 넘는 경우를 위해 이웃 버킷도 본다.
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const key = keyOf(x + dx * eps * 4, y + dy * eps * 4, z + dz * eps * 4);
          const list = buckets.get(key);
          if (!list) continue;
          for (const j of list) {
            const d = Math.max(Math.abs(positions[j * 3] - x), Math.abs(positions[j * 3 + 1] - y), Math.abs(positions[j * 3 + 2] - z));
            if (d < bestDist || (d === bestDist && best >= 0 && j < best)) {
              bestDist = d;
              best = j;
            }
          }
        }
      }
    }
    map[i] = best;
  }
  return map;
}
