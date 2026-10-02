/**
 * 삼각 메시 유틸: 법선 계산, 빌더, 기본 도형(UV 구·로프트 튜브·구면 캡 디스크), 병합, 경계 상자.
 * 눈·치아·혀·눈썹처럼 세분하지 않는 작은 파츠를 만든다. TypedArray만 쓴다.
 */
import { v3Add, v3Cross, v3Normalize, v3Scale, v3Sub, type Vec2, type Vec3 } from "../../../shared/math";

export interface TriMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** 면적 가중 정점 법선(단위). 퇴화 정점은 +z. */
export function computeVertexNormals(positions: Float32Array, indices: Uint32Array, out?: Float32Array): Float32Array {
  const normals = out ?? new Float32Array(positions.length);
  normals.fill(0);
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
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }
  normalizeInPlace(normals);
  return normals;
}

export function normalizeInPlace(normals: Float32Array): void {
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 1e-12) {
      normals[i] = x / len;
      normals[i + 1] = y / len;
      normals[i + 2] = z / len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }
  }
}

export function triMeshBounds(positions: Float32Array): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export class TriMeshBuilder {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  addVertex(p: Vec3, uv: Vec2): number {
    const index = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.uvs.push(uv[0], uv[1]);
    return index;
  }

  addTriangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** 사각형(a,b,c,d)을 두 삼각형으로 */
  addQuad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  build(): TriMesh {
    const positions = Float32Array.from(this.positions);
    const indices = Uint32Array.from(this.indices);
    return { positions, normals: computeVertexNormals(positions, indices), uvs: Float32Array.from(this.uvs), indices };
  }
}

export interface UvSphereOptions {
  readonly center: Vec3;
  /** 축별 반지름 */
  readonly radii: Vec3;
  readonly longitudes: number;
  readonly latitudes: number;
  /** 위치 변형(구면 방향 → 최종 위치). 기본은 타원체. */
  readonly displace?: (dir: Vec3, lon: number, lat: number) => Vec3;
  readonly uvRect?: { readonly u0: number; readonly v0: number; readonly u1: number; readonly v1: number };
}

/** 위도-경도 구(폴은 삼각 팬, 솔기 복제). 경도 0은 -z(뒤), 경도 ½은 +z(앞). */
export function uvSphere(options: UvSphereOptions): TriMesh {
  const { center, radii, longitudes, latitudes } = options;
  const rectU0 = options.uvRect?.u0 ?? 0;
  const rectV0 = options.uvRect?.v0 ?? 0;
  const rectW = (options.uvRect?.u1 ?? 1) - rectU0;
  const rectH = (options.uvRect?.v1 ?? 1) - rectV0;
  const builder = new TriMeshBuilder();
  const point = (lon: number, lat: number): Vec3 => {
    const phi = (Math.PI * lat) / latitudes;
    const psi = (2 * Math.PI * lon) / longitudes;
    const dir: Vec3 = [Math.sin(phi) * -Math.sin(psi), Math.cos(phi), Math.sin(phi) * -Math.cos(psi)];
    const base: Vec3 = [dir[0] * radii[0], dir[1] * radii[1], dir[2] * radii[2]];
    const p = options.displace ? options.displace(dir, lon, lat) : base;
    return v3Add(center, p);
  };
  // 행 0(위 폴)과 행 latitudes(아래 폴)는 경도마다 복제해 UV 솔기를 유지한다.
  const rows: number[][] = [];
  for (let lat = 0; lat <= latitudes; lat += 1) {
    const row: number[] = [];
    for (let lon = 0; lon <= longitudes; lon += 1) {
      const u = rectU0 + rectW * (lon / longitudes);
      const v = rectV0 + rectH * (1 - lat / latitudes);
      row.push(builder.addVertex(point(lon % longitudes, lat), [u, v]));
    }
    rows.push(row);
  }
  for (let lat = 0; lat < latitudes; lat += 1) {
    for (let lon = 0; lon < longitudes; lon += 1) {
      const a = rows[lat][lon];
      const b = rows[lat][lon + 1];
      const c = rows[lat + 1][lon + 1];
      const d = rows[lat + 1][lon];
      if (lat === 0) builder.addTriangle(a, d, c);
      else if (lat === latitudes - 1) builder.addTriangle(a, d, b);
      else {
        builder.addTriangle(a, d, c);
        builder.addTriangle(a, c, b);
      }
    }
  }
  return builder.build();
}

export interface LoftOptions {
  readonly uvRect?: { readonly u0: number; readonly v0: number; readonly u1: number; readonly v1: number };
  /** 시작/끝 링을 중심 정점으로 닫는다 */
  readonly capStart?: Vec3;
  readonly capEnd?: Vec3;
}

/** 링 배열을 삼각 튜브로 잇는다(원통 UV). 감김은 바깥 방향(링 중심 기준)으로 맞춘다. */
export function loftTriTube(rings: readonly (readonly Vec3[])[], options: LoftOptions = {}): TriMesh {
  const builder = new TriMeshBuilder();
  const n = rings[0].length;
  const u0 = options.uvRect?.u0 ?? 0;
  const v0 = options.uvRect?.v0 ?? 0;
  const w = (options.uvRect?.u1 ?? 1) - u0;
  const h = (options.uvRect?.v1 ?? 1) - v0;
  const rows: number[][] = rings.map((ring, j) => {
    const row: number[] = [];
    const v = v0 + h * (rings.length > 1 ? j / (rings.length - 1) : 0);
    for (let k = 0; k <= n; k += 1) row.push(builder.addVertex(ring[k % n], [u0 + w * (k / n), v]));
    return row;
  });
  // 감김 결정: 첫 사각형 법선과 바깥 방향
  const centroid = ringCentroid(rings[0], rings[1 % rings.length]);
  const p0 = rings[0][0];
  const p1 = rings[0][1 % n];
  const p3 = rings[1 % rings.length][0];
  const normal = v3Cross(v3Sub(p1, p0), v3Sub(p3, p0));
  const outward = v3Dot3(normal, v3Sub(p0, centroid)) >= 0;
  for (let j = 0; j + 1 < rings.length; j += 1) {
    for (let k = 0; k < n; k += 1) {
      const a = rows[j][k];
      const b = rows[j][k + 1];
      const c = rows[j + 1][k + 1];
      const d = rows[j + 1][k];
      if (outward) builder.addQuad(a, b, c, d);
      else builder.addQuad(d, c, b, a);
    }
  }
  if (options.capStart) {
    const center = builder.addVertex(options.capStart, [u0 + w * 0.5, v0]);
    for (let k = 0; k < n; k += 1) {
      const a = rows[0][k];
      const b = rows[0][k + 1];
      if (outward) builder.addTriangle(center, b, a);
      else builder.addTriangle(center, a, b);
    }
  }
  if (options.capEnd) {
    const last = rows.length - 1;
    const center = builder.addVertex(options.capEnd, [u0 + w * 0.5, v0 + h]);
    for (let k = 0; k < n; k += 1) {
      const a = rows[last][k];
      const b = rows[last][k + 1];
      if (outward) builder.addTriangle(center, a, b);
      else builder.addTriangle(center, b, a);
    }
  }
  return builder.build();
}

function v3Dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function ringCentroid(a: readonly Vec3[], b: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of [...a, ...b]) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = a.length + b.length;
  return [x / n, y / n, z / n];
}

export interface SphericalDiscOptions {
  /** 구 중심 */
  readonly center: Vec3;
  /** 구 반지름(디스크가 이 구면 위에 놓인다) */
  readonly radius: number;
  /** 디스크 중심 방향(단위) */
  readonly forward: Vec3;
  /** 디스크 평면의 up(단위, forward에 수직) */
  readonly up: Vec3;
  /** 각반경(rad): 디스크 가장자리가 forward와 이루는 각 */
  readonly angularRadiusX: number;
  readonly angularRadiusY: number;
  readonly segments: number;
  readonly rings: number;
}

/** 구면 위 타원 캡 디스크(홍채·동공·하이라이트). 법선은 구면 바깥 방향이 되도록 감는다. */
export function sphericalDisc(options: SphericalDiscOptions): TriMesh {
  const builder = new TriMeshBuilder();
  const right = v3Normalize(v3Cross(options.up, options.forward));
  const up = v3Normalize(v3Cross(options.forward, right));
  const center = builder.addVertex(v3Add(options.center, v3Scale(options.forward, options.radius)), [0.5, 0.5]);
  const rows: number[][] = [];
  for (let r = 1; r <= options.rings; r += 1) {
    const t = r / options.rings;
    const row: number[] = [];
    for (let s = 0; s < options.segments; s += 1) {
      const theta = (2 * Math.PI * s) / options.segments;
      const ax = options.angularRadiusX * t * Math.cos(theta);
      const ay = options.angularRadiusY * t * Math.sin(theta);
      // 작은 각: 접평면 방향을 구면에 투영
      const dir = v3Normalize(v3Add(options.forward, v3Add(v3Scale(right, Math.tan(ax)), v3Scale(up, Math.tan(ay)))));
      const p = v3Add(options.center, v3Scale(dir, options.radius));
      row.push(builder.addVertex(p, [0.5 + 0.5 * t * Math.cos(theta), 0.5 + 0.5 * t * Math.sin(theta)]));
    }
    rows.push(row);
  }
  const seg = options.segments;
  for (let s = 0; s < seg; s += 1) builder.addTriangle(center, rows[0][s], rows[0][(s + 1) % seg]);
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let s = 0; s < seg; s += 1) {
      const a = rows[r][s];
      const b = rows[r][(s + 1) % seg];
      const c = rows[r + 1][(s + 1) % seg];
      const d = rows[r + 1][s];
      builder.addQuad(a, b, c, d);
    }
  }
  return builder.build();
}

/** x를 뒤집은 거울 메시(정점 대응 유지, 감김 뒤집어 바깥 법선 유지). 오른쪽 파츠는 왼쪽의 거울로 만든다. */
export function mirrorTriMeshX(mesh: TriMesh): TriMesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = -mesh.positions[i];
    positions[i + 1] = mesh.positions[i + 1];
    positions[i + 2] = mesh.positions[i + 2];
    normals[i] = -mesh.normals[i];
    normals[i + 1] = mesh.normals[i + 1];
    normals[i + 2] = mesh.normals[i + 2];
  }
  const indices = new Uint32Array(mesh.indices.length);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    indices[t] = mesh.indices[t];
    indices[t + 1] = mesh.indices[t + 2];
    indices[t + 2] = mesh.indices[t + 1];
  }
  return { positions, normals, uvs: new Float32Array(mesh.uvs), indices };
}

/** 여러 삼각 메시를 하나로(인덱스 오프셋) */
export function mergeTriMeshes(meshes: readonly TriMesh[]): TriMesh {
  let vertexTotal = 0;
  let indexTotal = 0;
  for (const m of meshes) {
    vertexTotal += m.positions.length / 3;
    indexTotal += m.indices.length;
  }
  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const uvs = new Float32Array(vertexTotal * 2);
  const indices = new Uint32Array(indexTotal);
  let vOffset = 0;
  let iOffset = 0;
  for (const m of meshes) {
    positions.set(m.positions, vOffset * 3);
    normals.set(m.normals, vOffset * 3);
    uvs.set(m.uvs, vOffset * 2);
    for (let i = 0; i < m.indices.length; i += 1) indices[iOffset + i] = m.indices[i] + vOffset;
    vOffset += m.positions.length / 3;
    iOffset += m.indices.length;
  }
  return { positions, normals, uvs, indices };
}

/** 위치 배열의 간선 통계(삼각형): 모든 간선이 정확히 2면이면 수밀 */
export function triMeshIsWatertight(positions: Float32Array, indices: Uint32Array, weldEps = 1e-6): boolean {
  // 같은 위치의 정점을 용접해 토폴로지를 본다(UV 솔기 분할 무시)
  const weld = new Map<string, number>();
  const remap = new Int32Array(positions.length / 3);
  for (let i = 0; i < remap.length; i += 1) {
    const key = `${Math.round(positions[i * 3] / weldEps)}:${Math.round(positions[i * 3 + 1] / weldEps)}:${Math.round(positions[i * 3 + 2] / weldEps)}`;
    const existing = weld.get(key);
    if (existing === undefined) {
      weld.set(key, i);
      remap[i] = i;
    } else remap[i] = existing;
  }
  const edges = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let i = 0; i < 3; i += 1) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) if (count !== 2) return false;
  return true;
}
