/**
 * 머리 케이지: 32×16 위도-경도 구면 그리드(폴 캡 2) + 귀 2개(8×4 타원체 그리드). 세 개의 닫힌 다양체를 한 QuadMesh에 담는다.
 *
 * 형상은 머리 로컬(단위 반경) 공간에서 해석 함수(`headSurfacePoint`)로 정의한다: 타원체 기본형 + 뒤통수 아래 수축 +
 * 턱 좁힘 + 눈 소켓 함몰 + 코·눈썹 융기 + 볼·입술 융기. 체형 파라미터는 머리 프레임(중심·배율)만 바꾸므로
 * 머리 케이지는 프레임의 유사 변환으로만 움직인다(눈·치아 등 작은 파츠와 정확히 같은 변위).
 *
 * 입: 앞면 격자(위도 링 9·10 사이, 경도 열 14~18)의 쿼드 4개를 걷어 구멍을 내고(`mouthWarp`가 입선 주변을 세로로 눌러
 * 구멍을 얇은 틈 = 위·아래 입술로 만든다) 그 가장자리 루프(10정점)에서 입 안 주머니(6단 링 + 폴 캡)를 안쪽으로 낸다.
 * 위 입술(머리)과 아래 입술(턱)이 서로 다른 정점이라 턱 열림에서 틈이 벌어지고 치아·혀가 보인다. 구 위상(오일러 2)은 유지된다.
 * 원리: Blanz-Vetter 1999 고정 토폴로지 + 선형 델타 공간(개념만).
 */
import { bodyRegionIndex, type BodyParamKey, type ParamValues } from "../../../contracts";
import { v3Normalize, type Vec3 } from "../../../shared/math";
import { HEAD_LANDMARKS, headLocalToWorld, resolveProportions, type BodyProportions, type HeadFrame } from "../proportions";

import { QuadMeshBuilder, type QuadMesh } from "./quad-mesh";
import { mirrorRingsX } from "./sweep";
import { MOUTH_CAP_RECT, MOUTH_TUBE_RECT, UV_ISLANDS, capCellRect, discIslandUvs, placeUv, type UvRect } from "./uv-layout";

export const HEAD_LONGITUDES = 32;
export const HEAD_LATITUDES = 16;
export const EAR_LONGITUDES = 8;
export const EAR_LATITUDES = 4;

/** 머리 타원체 기본 반경(로컬) */
export const HEAD_RADII: Vec3 = [0.84, 1.0, 0.92];
/** 귀 타원체 반경(로컬): 얇은 디스크 */
export const EAR_RADII: Vec3 = [0.07, 0.3, 0.2];
/** 귀 중심 = 귀 기부 + 바깥쪽 오프셋 */
export const EAR_CENTER_OFFSET_X = 0.06;

export interface HeadCage {
  readonly mesh: QuadMesh;
  readonly frame: HeadFrame;
  readonly proportions: BodyProportions;
  /** 머리 구면 정점 수(귀·입 주머니 제외, 폴 포함) */
  readonly skullVertexCount: number;
  /** 입 안 주머니가 추가한 정점 수(링 6 × 10 + 캡 중심 1) */
  readonly mouthVertexCount: number;
  /**
   * 입 구멍 가장자리 루프의 케이지 정점 인덱스(10개): 위 입술 열 14→18(x +→−), 아래 입술 열 18→14(x −→+).
   * 인덱스 0~4가 위 입술, 5~9가 아래 입술이다(스킨 웨이트·테스트가 위·아래 입술을 구분하는 데 쓴다).
   */
  readonly mouthRim: readonly number[];
}

function gaussian(angle: number, sigma: number): number {
  return Math.exp(-(angle * angle) / (2 * sigma * sigma));
}

function angleBetween(a: Vec3, b: Vec3): number {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d);
}

function smooth01(x: number, edge0: number, edge1: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 입 구멍 위치: skullRings 배열 기준 링 9(위도 10)와 10(위도 11) 사이 밴드, 경도 열 14~17(앞 중앙 열 16 ±2) */
export const MOUTH_UPPER_RING = 9;
export const MOUTH_FIRST_COLUMN = 14;
export const MOUTH_COLUMNS = 4;
/** 입 안 주머니 링 수(가장자리 루프 제외) */
export const MOUTH_POCKET_RINGS = 6;

const MOUTH_Y = HEAD_LANDMARKS.mouth[1];
/** 입선 세로 압축 강도(1 = 완전히 접힘). 가운데 얇은 틈, 입꼬리로 갈수록 더 좁아진다. */
const MOUTH_COMPRESS = 0.95;
const MOUTH_CORNER_TAPER = 0.07;
/** 압축이 1로 유지되는 반폭(구멍 반폭 ≈ 0.28)과 0이 되는 반폭 */
const MOUTH_FLAT_HALF_WIDTH = 0.3;
const MOUTH_FALLOFF_END = 0.62;
const MOUTH_Y_SIGMA = 0.14;
/** 입술 앞 돌출량(머리 로컬) */
const MOUTH_LIP_BULGE = 0.03;

/**
 * 입 둘레 변형(머리 로컬): 입선 주변 정점을 세로로 눌러 구멍 가장자리 두 줄(위·아래 입술)이 얇은 틈을 이루게 하고 입술을 앞으로
 * 돋운다. |x|에만 의존해 좌우 대칭이 유지되고, 얼굴 앞면(z)에만 작용한다.
 */
export function mouthWarp(p: Vec3): Vec3 {
  const front = smooth01(p[2], 0.25, 0.6);
  if (front <= 0) return p;
  const ax = Math.abs(p[0]);
  const gx = 1 - smooth01(ax, MOUTH_FLAT_HALF_WIDTH, MOUTH_FALLOFF_END);
  const dy = p[1] - MOUTH_Y;
  const gy = Math.exp(-(dy * dy) / (2 * MOUTH_Y_SIGMA * MOUTH_Y_SIGMA));
  const taper = 1 + MOUTH_CORNER_TAPER * Math.min(1, (ax / MOUTH_FLAT_HALF_WIDTH) ** 2);
  const strength = Math.min(0.97, MOUTH_COMPRESS * taper * gx * gy * front);
  const y = MOUTH_Y + dy * (1 - strength);
  const lip = MOUTH_LIP_BULGE * front * (1 - smooth01(ax, 0.16, 0.5)) * Math.exp(-((y - MOUTH_Y) * (y - MOUTH_Y)) / (2 * 0.075 * 0.075));
  return [p[0], y, p[2] + lip];
}

interface PocketRing {
  /** 가장자리에서 안쪽(−z)으로 들어간 깊이 */
  readonly depth: number;
  /** 가로 배율(가장자리 x 기준) */
  readonly sx: number;
  /** 세로 배율(입선 기준, 가장자리의 얇은 틈을 입 안 높이로 키운다) */
  readonly hy: number;
  /** 세로 이동(입 안 바닥을 조금 낮춘다) */
  readonly drop: number;
}

/** 입 안 주머니 벽이 바깥 피부 안쪽에 유지하는 최소 두께(머리 로컬) */
const POCKET_WALL = 0.04;

/** 치아 아치(x ±0.2)·혀가 들어가는 입 안 단면. 아래쪽 벽은 입 아래 피부 단면에서 POCKET_WALL 안쪽으로 클램프된다. */
const POCKET_RINGS: readonly PocketRing[] = [
  { depth: 0.04, sx: 1.08, hy: 3, drop: 0 },
  { depth: 0.12, sx: 1.2, hy: 8, drop: -0.01 },
  { depth: 0.26, sx: 1.22, hy: 10, drop: -0.02 },
  { depth: 0.4, sx: 1.1, hy: 9, drop: -0.03 },
  { depth: 0.52, sx: 0.85, hy: 6.5, drop: -0.03 },
  { depth: 0.6, sx: 0.5, hy: 3.5, drop: -0.03 },
];
const POCKET_CAP_DEPTH = 0.65;

/** 중앙 열(x=0)의 입 아래 피부 단면 (z, y): z 내림차순. 주머니 아래 벽이 피부를 뚫지 않게 하는 기준이다. */
function lowerSkinProfile(skullLocal: readonly (readonly Vec3[])[]): Array<readonly [number, number]> {
  const column = HEAD_LONGITUDES / 2;
  const profile: Array<readonly [number, number]> = [];
  for (let r = MOUTH_UPPER_RING + 1; r < skullLocal.length; r += 1) profile.push([skullLocal[r][column][2], skullLocal[r][column][1]]);
  return profile;
}

/** 피부 단면에서 z에 대응하는 y(선형 보간, 범위 밖은 끝 값) */
function profileY(profile: ReadonlyArray<readonly [number, number]>, z: number): number {
  if (z >= profile[0][0]) return profile[0][1];
  for (let i = 0; i + 1 < profile.length; i += 1) {
    const [z0, y0] = profile[i];
    const [z1, y1] = profile[i + 1];
    if (z <= z0 && z >= z1) return y0 + ((y1 - y0) * (z0 - z)) / (z0 - z1);
  }
  return profile[profile.length - 1][1];
}

/**
 * 구멍 가장자리 루프(rimIds, 머리 로컬 위치 rimLocal; 위 줄 열 14→18, 아래 줄 열 18→14)에서 입 안 주머니를 만든다.
 * 쿼드 방향은 이웃 간선이 정하므로(addQuad) 바깥쪽 법선 규약이 구멍 가장자리에서 그대로 이어진다.
 */
function addMouthPocket(
  builder: QuadMeshBuilder,
  rimIds: readonly number[],
  rimLocal: readonly Vec3[],
  lowerProfile: ReadonlyArray<readonly [number, number]>,
  toWorld: (local: Vec3) => Vec3,
  region: number,
): void {
  const n = rimIds.length;
  const half = Math.floor(n / 2);
  const rowCount = POCKET_RINGS.length + 1;
  const uvRows: number[][] = [];
  for (let j = 0; j < rowCount; j += 1) {
    const row: number[] = [];
    for (let k = 0; k <= n; k += 1) {
      const uv = placeUv(MOUTH_TUBE_RECT, k / n, j / (rowCount - 1));
      row.push(builder.addUv(uv[0], uv[1]));
    }
    uvRows.push(row);
  }
  // 아래 줄 정점(루프 후반)의 z는 줄 중앙 z 기준으로 피부 단면에 대응시킨다.
  const lowerCenterZ = rimLocal[half + Math.floor(half / 2)][2];
  const rings: number[][] = [[...rimIds]];
  for (const spec of POCKET_RINGS) {
    rings.push(
      rimLocal.map((p, i) => {
        const z = p[2] - spec.depth;
        let y = MOUTH_Y + (p[1] - MOUTH_Y) * spec.hy + spec.drop;
        if (i >= half) y = Math.max(y, profileY(lowerProfile, z + (lowerCenterZ - p[2])) + POCKET_WALL);
        return builder.addVertex(toWorld([p[0] * spec.sx, y, z]), region);
      }),
    );
  }
  for (let j = 0; j + 1 < rings.length; j += 1) {
    for (let k = 0; k < n; k += 1) {
      const k1 = (k + 1) % n;
      builder.addQuad([rings[j][k], rings[j][k1], rings[j + 1][k1], rings[j + 1][k]], [uvRows[j][k], uvRows[j][k + 1], uvRows[j + 1][k + 1], uvRows[j + 1][k]]);
    }
  }
  const upperCenterZ = rimLocal[Math.floor(half / 2)][2];
  const center = builder.addVertex(toWorld([0, MOUTH_Y + POCKET_RINGS[POCKET_RINGS.length - 1].drop, upperCenterZ - POCKET_CAP_DEPTH]), region);
  const disc = discIslandUvs(MOUTH_CAP_RECT, n);
  const capRing = disc.ring.map((uv) => builder.addUv(uv[0], uv[1]));
  const capCenter = builder.addUv(disc.center[0], disc.center[1]);
  builder.addPoleCap(rings[rings.length - 1], center, capRing, capCenter);
}

const EYE_DIR = v3Normalize(HEAD_LANDMARKS.eye);
const BROW_DIR = v3Normalize(HEAD_LANDMARKS.brow);
const NOSE_DIR = v3Normalize(HEAD_LANDMARKS.noseTip);
const BRIDGE_DIR = v3Normalize(HEAD_LANDMARKS.noseBridge);
const CHEEK_DIR = v3Normalize(HEAD_LANDMARKS.cheek);
const MOUTH_DIR = v3Normalize(HEAD_LANDMARKS.mouth);
const CHIN_DIR = v3Normalize(HEAD_LANDMARKS.chin);

/** 좌우 거울 특징의 확률적 합집합 1 − (1−a)(1−b): max와 달리 정중선에서 미분이 연속이라 꺾임이 없다. */
function mirroredFeature(dir: Vec3, feature: Vec3, sigma: number): number {
  const mirrored: Vec3 = [-feature[0], feature[1], feature[2]];
  const a = gaussian(angleBetween(dir, feature), sigma);
  const b = gaussian(angleBetween(dir, mirrored), sigma);
  return a + b - a * b;
}

/** 단위 방향 → 머리 로컬 표면 점. 결정적·좌우 대칭(x 부호만 다름). */
export function headSurfacePoint(dir: Vec3): Vec3 {
  const [x, y, z] = dir;
  const base = 1 / Math.sqrt((x / HEAD_RADII[0]) ** 2 + (y / HEAD_RADII[1]) ** 2 + (z / HEAD_RADII[2]) ** 2);
  let f = 1;
  // 뒤통수 아래(후두부 → 목) 수축
  if (y < 0 && z < 0) f *= 1 - 0.5 * Math.pow(-y, 1.5) * -z;
  // 턱 좁힘(옆·뒤), 턱 끝은 유지
  f *= 1 - 0.2 * smooth01(-y, 0.35, 1) * (1 - 0.85 * Math.max(z, 0));
  // 얼굴 평탄화
  f *= 1 - 0.05 * Math.max(z, 0) ** 2;
  // 눈 소켓 함몰
  f *= 1 - 0.09 * mirroredFeature(dir, EYE_DIR, 0.22);
  // 눈썹 융기
  f *= 1 + 0.03 * mirroredFeature(dir, BROW_DIR, 0.2);
  // 코·콧등
  f *= 1 + 0.13 * gaussian(angleBetween(dir, NOSE_DIR), 0.15);
  f *= 1 + 0.045 * gaussian(angleBetween(dir, BRIDGE_DIR), 0.14);
  // 볼
  f *= 1 + 0.03 * mirroredFeature(dir, CHEEK_DIR, 0.3);
  // 입술
  f *= 1 + 0.025 * gaussian(angleBetween(dir, MOUTH_DIR), 0.15);
  // 턱 끝
  f *= 1 + 0.04 * gaussian(angleBetween(dir, CHIN_DIR), 0.25);
  const r = base * f;
  return [x * r, y * r, z * r];
}

/** 위도 링(경도 c=0 뒤, c=n/2 앞), x는 c ↔ n−c가 정확히 부호만 다르다. */
function symmetricLatitudeRing(n: number, phi: number, toPoint: (dir: Vec3) => Vec3): Vec3[] {
  const half = n / 2;
  const points: Vec3[] = new Array<Vec3>(n);
  for (let c = 0; c <= half; c += 1) {
    const psi = (2 * Math.PI * c) / n;
    const dir: Vec3 = [c === 0 || c === half ? 0 : Math.sin(phi) * Math.sin(psi), Math.cos(phi), -Math.sin(phi) * Math.cos(psi)];
    const p = toPoint(dir);
    points[c] = c === 0 || c === half ? [0, p[1], p[2]] : p;
    if (c !== 0 && c !== half) points[n - c] = [-p[0], p[1], p[2]];
  }
  return points;
}

/** 대칭 강제 없는 위도 링(귀처럼 x=0 밖에 있는 그리드용). 경도 c=0 뒤, c=n/2 앞. */
function latitudeRing(n: number, phi: number, toPoint: (dir: Vec3) => Vec3): Vec3[] {
  const points: Vec3[] = [];
  for (let c = 0; c < n; c += 1) {
    const psi = (2 * Math.PI * c) / n;
    points.push(toPoint([Math.sin(phi) * Math.sin(psi), Math.cos(phi), -Math.sin(phi) * Math.cos(psi)]));
  }
  return points;
}

function addGrid(
  builder: QuadMeshBuilder,
  rings: readonly (readonly Vec3[])[],
  top: Vec3,
  bottom: Vec3,
  island: UvRect,
  capTop: UvRect,
  capBottom: UvRect,
  region: number,
  skip?: (ring: number, column: number) => boolean,
): number[][] {
  const n = rings[0].length;
  const ringIndices = rings.map((ring) => builder.addVertices(ring, region));
  const uvRows = ringIndices.map((_, j) => {
    const row: number[] = [];
    const v = 1 - (j + 1) / (rings.length + 1);
    for (let k = 0; k <= n; k += 1) {
      const uv = placeUv(island, k / n, v);
      row.push(builder.addUv(uv[0], uv[1]));
    }
    return row;
  });
  builder.addTube(ringIndices, uvRows, skip ? { skip } : {});
  const addCap = (ring: readonly number[], center: Vec3, cell: UvRect): void => {
    const centerIndex = builder.addVertex(center, region);
    const disc = discIslandUvs(cell, ring.length);
    const uvRing = disc.ring.map((uv) => builder.addUv(uv[0], uv[1]));
    const uvCenter = builder.addUv(disc.center[0], disc.center[1]);
    builder.addPoleCap(ring, centerIndex, uvRing, uvCenter);
  };
  addCap(ringIndices[0], top, capTop);
  addCap(ringIndices[ringIndices.length - 1], bottom, capBottom);
  return ringIndices;
}

/** 귀 로컬 점(왼귀): 기부 + 바깥 오프셋 중심의 얇은 타원체 */
export function earLocalPoint(dir: Vec3): Vec3 {
  const base = HEAD_LANDMARKS.ear;
  return [base[0] + EAR_CENTER_OFFSET_X + dir[0] * EAR_RADII[0], base[1] + dir[1] * EAR_RADII[1], base[2] + dir[2] * EAR_RADII[2]];
}

/** 스펙 공개 API: 체형 파라미터로 머리 케이지를 만든다(머리 프레임만 파라미터에 의존). */
export function buildHeadCage(params: ParamValues<BodyParamKey>): HeadCage {
  const p = resolveProportions(params);
  const frame = p.head;
  const builder = new QuadMeshBuilder();
  const region = bodyRegionIndex("head");
  const toWorld = (local: Vec3): Vec3 => headLocalToWorld(frame, local);

  const skullLocal: Vec3[][] = [];
  for (let l = 1; l < HEAD_LATITUDES; l += 1) {
    const phi = (Math.PI * l) / HEAD_LATITUDES;
    skullLocal.push(symmetricLatitudeRing(HEAD_LONGITUDES, phi, (dir) => mouthWarp(headSurfacePoint(dir))));
  }
  const skullRings = skullLocal.map((ring) => ring.map(toWorld));
  const inMouthHole = (ring: number, column: number): boolean => ring === MOUTH_UPPER_RING && column >= MOUTH_FIRST_COLUMN && column < MOUTH_FIRST_COLUMN + MOUTH_COLUMNS;
  const skullIds = addGrid(
    builder,
    skullRings,
    toWorld(headSurfacePoint([0, 1, 0])),
    toWorld(headSurfacePoint([0, -1, 0])),
    UV_ISLANDS.head,
    capCellRect("head", 0),
    capCellRect("head", 1),
    region,
    inMouthHole,
  );
  const skullVertexCount = builder.vertexCount;

  // 입 안 주머니: 구멍 가장자리 루프(위 줄 열 14→18, 아래 줄 열 18→14)
  const columns = Array.from({ length: MOUTH_COLUMNS + 1 }, (_, i) => MOUTH_FIRST_COLUMN + i);
  const rimIds = [...columns.map((c) => skullIds[MOUTH_UPPER_RING][c]), ...[...columns].reverse().map((c) => skullIds[MOUTH_UPPER_RING + 1][c])];
  const rimLocal = [...columns.map((c) => skullLocal[MOUTH_UPPER_RING][c]), ...[...columns].reverse().map((c) => skullLocal[MOUTH_UPPER_RING + 1][c])];
  addMouthPocket(builder, rimIds, rimLocal, lowerSkinProfile(skullLocal), toWorld, region);
  const mouthVertexCount = builder.vertexCount - skullVertexCount;

  const leftEarRings: Vec3[][] = [];
  for (let l = 1; l < EAR_LATITUDES; l += 1) {
    const phi = (Math.PI * l) / EAR_LATITUDES;
    leftEarRings.push(latitudeRing(EAR_LONGITUDES, phi, (dir) => earLocalPoint(dir)));
  }
  const earTop = earLocalPoint([0, 1, 0]);
  const earBottom = earLocalPoint([0, -1, 0]);
  const leftWorld = leftEarRings.map((ring) => ring.map(toWorld));
  const rightWorld = mirrorRingsX(leftWorld);
  addGrid(builder, leftWorld, toWorld(earTop), toWorld(earBottom), UV_ISLANDS.leftEar, capCellRect("head", 2), capCellRect("head", 3), region);
  const mirrorPoint = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  addGrid(builder, rightWorld, mirrorPoint(toWorld(earTop)), mirrorPoint(toWorld(earBottom)), UV_ISLANDS.rightEar, capCellRect("head", 4), capCellRect("head", 5), region);

  const { mesh, vertexMap } = builder.buildWithMap();
  return { mesh, frame, proportions: p, skullVertexCount, mouthVertexCount, mouthRim: rimIds.map((id) => vertexMap[id]) };
}

/** 로컬 좌표가 두피(헤어 앵커) 영역인지: 눈썹선 위 또는 뒤통수, 귀 제외 */
export function isScalpLocal(local: Vec3): boolean {
  const [x, y, z] = local;
  if (Math.abs(x) > 0.8) return false;
  if (y >= HEAD_LANDMARKS.scalpMinY) return true;
  return z < -0.15 && y > -0.5;
}
