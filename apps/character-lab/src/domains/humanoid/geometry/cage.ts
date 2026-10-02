/**
 * 몸 케이지: 비례(proportions.ts)에서 닫힌 쿼드 다양체 하나를 만든다.
 *
 * 토폴로지(고정, 파라미터 무관):
 * - 몸통: 20열 튜브(가랑이 링 → 목 꼭대기, 폴 캡). 어깨에 4×3 사각형 구멍을 내고 그 경계 루프(14정점)에서 팔 튜브가 시작한다.
 * - 팔: 14열 튜브(삼각근 → 팔꿈치 → 손목 → 손바닥 → 손가락 관절 링). 손 끝은 7+7 평평한 링이며 끝 캡 6칸 중
 *   4칸이 손가락 구멍(4정점 루프 → 4열 손가락 튜브 + 폴 캡), 엄지는 손 앞면의 1칸 구멍에서 나온다.
 * - 다리: 가랑이 링을 앞·뒤 중앙 정점과 가랑이 정점 C로 두 루프(각 12정점)로 나눠 Y분기 → 12열 다리 튜브 → 발(납작 링) → 발바닥 폴 캡.
 * - 오른쪽은 왼쪽 링의 정확한 x 거울이며 같은 인덱스 패턴으로 추가한다(좌우 대칭 테스트 보장).
 * UV는 uv-layout.ts의 섬에 배치하고 정점 영역(BODY_REGIONS)을 태그한다.
 * 원리: Hyun 2005 스윕 로프트·Thiery 2013 스피어-메시 프록시(개념만, 코드 복제 없음).
 */
import { BODY_REGIONS, bodyRegionIndex, type BodyParamKey, type BodyRegion, type ParamValues } from "../../../contracts";
import { v3Add, v3Cross, v3Normalize, v3Scale, v3Sub, type Vec3 } from "../../../shared/math";
import { HAND_END_MARGIN_RATIO, LEFT_THUMB_AXIS, fingerCenterZ, leftThumbBase, resolveProportions, type BodyProportions } from "../proportions";

import { NO_REGION, QuadMeshBuilder, type QuadMesh } from "./quad-mesh";
import { mirrorRingsX, symmetricRingXZ } from "./sweep";
import { UV_ISLANDS, capCellRect, discIslandUvs, fingerBodyRect, placeUv, type UvRect } from "./uv-layout";

export const TORSO_COLUMNS = 20;
export const ARM_COLUMNS = 14;
export const LEG_COLUMNS = 12;
export const FINGER_COLUMNS = 4;
/** 왼팔 구멍: 쿼드 열 3..6(정점 3..7), 링 행 6..9(밴드 3개) */
const HOLE_COL0 = 3;
const HOLE_WIDTH = 4;
const HOLE_ROW0 = 6;
const HOLE_HEIGHT = 3;
/** 엄지 구멍: 손 튜브 밴드 1(손바닥1→손바닥2), 열 13(앞면) */
const THUMB_BAND = 1;
const THUMB_COLUMN = ARM_COLUMNS - 1;

export interface BodyCageLandmarks {
  /** 왼 상완 중간 링 정점 */
  readonly leftUpperArmRing: readonly number[];
  readonly rightUpperArmRing: readonly number[];
  /** 왼 허벅지 중간 링 */
  readonly leftThighRing: readonly number[];
  readonly rightThighRing: readonly number[];
  /** 가랑이 공유 정점 */
  readonly crotch: number;
  /** 목 꼭대기 캡 중심 */
  readonly neckCap: number;
  /** 왼 중지 끝 캡 중심 */
  readonly leftMiddleFingerTip: number;
  readonly rightMiddleFingerTip: number;
  /** 왼발 바닥 캡 중심 */
  readonly leftSole: number;
  readonly rightSole: number;
}

export interface BodyCage {
  readonly mesh: QuadMesh;
  readonly proportions: BodyProportions;
  readonly landmarks: BodyCageLandmarks;
}

type Side = "left" | "right";

const REGION = (name: BodyRegion): number => bodyRegionIndex(name);
export const REGION_COUNT = BODY_REGIONS.length;

interface RingSpec {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly region: number;
  readonly square?: number;
}

function torsoShape(amount: number): (theta: number) => number {
  return (theta) => 1 - amount * Math.cos(4 * theta);
}

/** 팔 단면 링: 축 +x, ψ=0 앞(+z), 90° 아래(−y), 180° 뒤, 270° 위. 점 0은 ψ0=45°(앞-아래). */
function armRing(cx: number, cy: number, cz: number, ry: number, rz: number, n: number = ARM_COLUMNS, psi0: number = Math.PI / 4): Vec3[] {
  const points: Vec3[] = [];
  for (let k = 0; k < n; k += 1) {
    const psi = psi0 + (2 * Math.PI * k) / n;
    points.push([cx, cy - ry * Math.sin(psi), cz + rz * Math.cos(psi)]);
  }
  return points;
}

/** 손 단면 링(14): k=0..6 아래(손바닥) 줄 앞→뒤, k=7..13 위 줄 뒤→앞. 가장자리는 두께를 줄여 둥글린다. */
function handRing(cx: number, cy: number, cz: number, width: number, thickness: number, margin: number): Vec3[] {
  const zs: number[] = [];
  const inner = width - 2 * margin;
  zs.push(width / 2, width / 2 - margin);
  for (let j = 2; j <= 4; j += 1) zs.push(width / 2 - margin - (inner * (j - 1)) / 4);
  zs.push(-width / 2 + margin, -width / 2);
  const points: Vec3[] = new Array<Vec3>(ARM_COLUMNS);
  for (let j = 0; j <= 6; j += 1) {
    const z = zs[j];
    const edge = Math.min(1, Math.abs(z) / (width / 2));
    const t = (thickness / 2) * Math.max(0.3, Math.sqrt(Math.max(0, 1 - edge * edge * 0.92)));
    points[j] = [cx, cy - t, cz + z];
    points[ARM_COLUMNS - 1 - j] = [cx, cy + t, cz + z];
  }
  return points;
}

/** 다리 단면 링(12): θ=0 앞(+z), 90° 바깥(+x, 왼다리), 180° 뒤, 270° 안쪽. 각도 목록으로 분포를 지정한다. */
function legRing(cx: number, cy: number, cz: number, rx: number, rz: number, angles: readonly number[]): Vec3[] {
  return angles.map((theta): Vec3 => [cx + rx * Math.sin(theta), cy, cz + rz * Math.cos(theta)]);
}

/** 가랑이 루프에 맞춘 허벅지 각 분포(i=0..10 앞→바깥→뒤 18° 간격, i=11 안쪽 270°) */
const CROTCH_ANGLES: readonly number[] = [...Array.from({ length: 11 }, (_, i) => (Math.PI * i) / 10), (3 * Math.PI) / 2];
const UNIFORM_LEG_ANGLES: readonly number[] = Array.from({ length: LEG_COLUMNS }, (_, i) => (2 * Math.PI * i) / LEG_COLUMNS);

function lerpAngles(t: number): number[] {
  return CROTCH_ANGLES.map((a, i) => a + (UNIFORM_LEG_ANGLES[i] - a) * t);
}

/** 손가락 단면(4): [앞-아래, 뒤-아래, 뒤-위, 앞-위] */
function fingerRing(cx: number, cy: number, cz: number, r: number): Vec3[] {
  return [
    [cx, cy - r, cz + r],
    [cx, cy - r, cz - r],
    [cx, cy + r, cz - r],
    [cx, cy + r, cz + r],
  ];
}

/** 축 a 위 거리 d의 4정점 링: [근위-위, 근위-아래, 원위-아래, 원위-위] (u=원위 방향, v=위 방향) */
function thumbRing(base: Vec3, a: Vec3, u: Vec3, v: Vec3, d: number, r: number): Vec3[] {
  const c = v3Add(base, v3Scale(a, d));
  const up = v3Scale(v, r);
  const dist = v3Scale(u, r);
  return [v3Add(v3Sub(c, dist), up), v3Sub(v3Sub(c, dist), up), v3Sub(v3Add(c, dist), up), v3Add(v3Add(c, dist), up)];
}

class CageAssembler {
  readonly builder = new QuadMeshBuilder();

  uvRow(island: UvRect, n: number, v: number): number[] {
    const row: number[] = [];
    for (let k = 0; k <= n; k += 1) {
      const uv = placeUv(island, k / n, v);
      row.push(this.builder.addUv(uv[0], uv[1]));
    }
    return row;
  }

  /** 링 좌표 목록을 정점으로 추가 */
  addRings(rings: readonly (readonly Vec3[])[], region: number): number[][] {
    return rings.map((ring) => this.builder.addVertices(ring, region));
  }

  /** 링 인덱스 열을 튜브로 잇고 섬 안에 v를 균등 배치한다. */
  tube(rings: readonly (readonly number[])[], island: UvRect, options: { readonly skip?: (j: number, k: number) => boolean; readonly v0?: number; readonly v1?: number } = {}): void {
    const n = rings[0].length;
    const v0 = options.v0 ?? 0;
    const v1 = options.v1 ?? 1;
    const uvRows = rings.map((_, j) => this.uvRow(island, n, v0 + ((v1 - v0) * j) / Math.max(1, rings.length - 1)));
    this.builder.addTube(rings, uvRows, options.skip ? { skip: options.skip } : {});
  }

  /** 폴 캡: 중심 정점을 추가하고 캡 셀 섬에 디스크 UV를 둔다. */
  cap(ring: readonly number[], center: Vec3, cell: UvRect, region: number): number {
    const centerIndex = this.builder.addVertex(center, region);
    const disc = discIslandUvs(cell, ring.length);
    const uvRing = disc.ring.map((uv) => this.builder.addUv(uv[0], uv[1]));
    const uvCenter = this.builder.addUv(disc.center[0], disc.center[1]);
    this.builder.addPoleCap(ring, centerIndex, uvRing, uvCenter);
    return centerIndex;
  }
}

interface ArmBuildResult {
  readonly upperArmMidRing: readonly number[];
  readonly middleFingerTip: number;
}

function torsoRingSpecs(p: BodyProportions): RingSpec[] {
  const hips = REGION("hips");
  const torso = REGION("torso");
  const neck = REGION("neck");
  const h = p.hipsBoneY;
  const sq = 0.05;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return [
    { y: p.crotchY, rx: p.legJointX + p.thighRadius * 0.95, rz: p.hipDepth * 0.95, region: hips, square: sq },
    { y: p.hipJointY, rx: p.hipHalfWidth, rz: p.hipDepth, region: hips, square: sq },
    { y: h + 0.1 * p.scale, rx: p.waistHalfWidth, rz: p.waistDepth, region: torso, square: sq },
    { y: h + 0.2 * p.scale, rx: lerp(p.waistHalfWidth, p.chestHalfWidth, 0.5), rz: lerp(p.waistDepth, p.chestDepth, 0.5), region: torso, square: sq },
    { y: h + 0.29 * p.scale, rx: p.chestHalfWidth, rz: p.chestDepth, region: torso, square: sq },
    { y: h + 0.36 * p.scale, rx: lerp(p.chestHalfWidth, p.shoulderHalfWidth, 0.6), rz: lerp(p.chestDepth, p.shoulderDepth, 0.6), region: torso, square: sq },
    { y: h + 0.41 * p.scale, rx: p.shoulderHalfWidth * 0.98, rz: p.shoulderDepth, region: torso, square: sq },
    { y: h + 0.455 * p.scale, rx: p.shoulderHalfWidth, rz: p.shoulderDepth, region: torso, square: sq },
    { y: h + 0.5 * p.scale, rx: p.shoulderHalfWidth, rz: p.shoulderDepth, region: torso, square: sq },
    { y: h + 0.53 * p.scale, rx: p.shoulderHalfWidth * 0.97, rz: p.shoulderDepth * 0.95, region: torso, square: sq },
    { y: h + 0.555 * p.scale, rx: p.shoulderHalfWidth * 0.7, rz: p.shoulderDepth * 0.8, region: torso, square: 0.02 },
    { y: p.neckBaseY, rx: p.neckRadius * 1.15, rz: p.neckRadius * 1.1, region: neck },
    { y: p.neckBaseY + p.neckLength * 0.6, rx: p.neckRadius, rz: p.neckRadius * 0.95, region: neck },
    { y: p.neckBaseY + p.neckLength + 0.03 * p.scale, rx: p.neckRadius * 0.95, rz: p.neckRadius * 0.9, region: neck },
  ];
}

/** 구멍 경계 루프(14정점): 아래 줄 앞→뒤, 뒤쪽 세로, 위 줄 뒤→앞, 앞쪽 세로. colMap으로 오른쪽 거울 열을 쓴다. */
function holeLoop(rings: readonly (readonly number[])[], colMap: (c: number) => number): number[] {
  const loop: number[] = [];
  for (let c = HOLE_COL0; c <= HOLE_COL0 + HOLE_WIDTH; c += 1) loop.push(rings[HOLE_ROW0][colMap(c)]);
  for (let r = HOLE_ROW0 + 1; r < HOLE_ROW0 + HOLE_HEIGHT; r += 1) loop.push(rings[r][colMap(HOLE_COL0 + HOLE_WIDTH)]);
  for (let c = HOLE_COL0 + HOLE_WIDTH; c >= HOLE_COL0; c -= 1) loop.push(rings[HOLE_ROW0 + HOLE_HEIGHT][colMap(c)]);
  for (let r = HOLE_ROW0 + HOLE_HEIGHT - 1; r > HOLE_ROW0; r -= 1) loop.push(rings[r][colMap(HOLE_COL0)]);
  return loop;
}

const mirrorColumn = (c: number): number => (TORSO_COLUMNS - c) % TORSO_COLUMNS;
const LEFT_HOLE_QUAD_COLS = new Set(Array.from({ length: HOLE_WIDTH }, (_, i) => HOLE_COL0 + i));
const RIGHT_HOLE_QUAD_COLS = new Set([...LEFT_HOLE_QUAD_COLS].map((c) => TORSO_COLUMNS - 1 - c));

/** 왼팔(또는 거울) 링 좌표: 삼각근 → 손목 → 손 → (손가락은 별도) */
function leftArmRings(p: BodyProportions): { arm: Vec3[][]; hand: Vec3[][]; wristX: number; knuckleX: number } {
  const sx = p.shoulderJointX;
  const y = p.shoulderJointY;
  const upper = p.upperArmLength;
  const lower = p.lowerArmLength;
  const r = (x: number, ry: number, rz: number): Vec3[] => armRing(x, y, 0, ry, rz);
  const arm: Vec3[][] = [
    r(sx + 0.035 * p.scale, p.upperArmRadius * 1.2, p.upperArmRadius * 1.3),
    r(sx + 0.1 * p.scale, p.upperArmRadius, p.upperArmRadius),
    r(sx + upper * 0.7, p.upperArmRadius * 0.93, p.upperArmRadius * 0.93),
    r(sx + upper - 0.02 * p.scale, p.elbowRadius, p.elbowRadius * 1.05),
    r(sx + upper + 0.02 * p.scale, p.elbowRadius * 0.95, p.elbowRadius),
    r(sx + upper + lower * 0.42, p.elbowRadius * 0.9, p.elbowRadius * 0.9),
    r(sx + upper + lower - 0.03 * p.scale, p.wristRadius * 1.1, p.wristRadius * 1.15),
    r(sx + upper + lower, p.wristRadius, p.wristRadius * 1.1),
  ];
  const wristX = sx + upper + lower;
  const margin = p.handWidth * HAND_END_MARGIN_RATIO;
  const hand: Vec3[][] = [
    handRing(wristX + 0.025 * p.scale, y, 0, p.handWidth * 0.85, p.handThickness, margin),
    handRing(wristX + 0.055 * p.scale, y, 0, p.handWidth, p.handThickness, margin),
    handRing(wristX + p.palmLength, y, 0, p.handWidth, p.handThickness * 0.9, margin),
  ];
  return { arm, hand, wristX, knuckleX: wristX + p.palmLength };
}

function leftFingerRings(p: BodyProportions, knuckleX: number, fingerIndex: number, centerZ: number): { rings: Vec3[][]; tip: Vec3 } {
  const lengths = p.fingers[fingerIndex];
  const y = p.shoulderJointY;
  const r = p.fingerRadius;
  const px = knuckleX + lengths.proximal;
  const ix = px + lengths.intermediate;
  const dx = ix + lengths.distal;
  const rings: Vec3[][] = [
    fingerRing(knuckleX + 0.01 * p.scale, y, centerZ, r * 1.15),
    fingerRing(knuckleX + lengths.proximal * 0.6, y, centerZ, r),
    fingerRing(px, y, centerZ, r * 0.95),
    fingerRing(ix, y, centerZ, r * 0.88),
    fingerRing(dx - 0.006 * p.scale, y, centerZ, r * 0.7),
  ];
  return { rings, tip: [dx, y, centerZ] };
}

function leftThumbRings(p: BodyProportions, base: Vec3): { rings: Vec3[][]; tip: Vec3 } {
  const a = LEFT_THUMB_AXIS;
  const xAxis: Vec3 = [1, 0, 0];
  const u = v3Normalize(v3Sub(xAxis, v3Scale(a, a[0])));
  const v = v3Normalize(v3Cross(a, u));
  const r = p.fingerRadius * 1.15;
  const t = p.thumb;
  const d1 = t.proximal;
  const d2 = d1 + t.intermediate;
  const d3 = d2 + t.distal;
  const rings: Vec3[][] = [
    thumbRing(base, a, u, v, 0.012 * p.scale, r * 1.3),
    thumbRing(base, a, u, v, d1 * 0.6, r * 1.15),
    thumbRing(base, a, u, v, d1, r),
    thumbRing(base, a, u, v, d2, r * 0.9),
    thumbRing(base, a, u, v, d3 - 0.006 * p.scale, r * 0.7),
  ];
  return { rings, tip: v3Add(base, v3Scale(a, d3)) };
}

function buildArm(asm: CageAssembler, p: BodyProportions, side: Side, loop: readonly number[]): ArmBuildResult {
  const mirror = side === "right";
  const left = leftArmRings(p);
  const armCoords = mirror ? mirrorRingsX(left.arm) : left.arm;
  const handCoords = mirror ? mirrorRingsX(left.hand) : left.hand;
  const armRegion = REGION(side === "left" ? "leftArm" : "rightArm");
  const handRegion = REGION(side === "left" ? "leftHand" : "rightHand");
  const island = side === "left" ? UV_ISLANDS.leftArm : UV_ISLANDS.rightArm;
  const armRings = asm.addRings(armCoords, armRegion);
  const handRings = asm.addRings(handCoords, handRegion);
  const all = [loop, ...armRings, ...handRings];
  // 팔+손을 한 튜브로(엄지 구멍은 손 밴드 THUMB_BAND, 열 THUMB_COLUMN)
  const thumbBandIndex = armRings.length + THUMB_BAND;
  asm.tube(all, island, { skip: (j, k) => j === thumbBandIndex && k === THUMB_COLUMN, v0: 0, v1: 0.82 });
  const knuckle = handRings[handRings.length - 1];
  // 손 끝 캡: j=0, 5는 채우고 1..4는 손가락 구멍
  const capCell = capCellRect("skin", side === "left" ? 3 : 4);
  const bottom = (j: number): number => knuckle[j];
  const top = (j: number): number => knuckle[ARM_COLUMNS - 1 - j];
  for (const j of [0, 5]) {
    const u0 = j === 0 ? 0.05 : 0.55;
    const uv = [placeUv(capCell, u0, 0.1), placeUv(capCell, u0 + 0.4, 0.1), placeUv(capCell, u0 + 0.4, 0.9), placeUv(capCell, u0, 0.9)].map((q) =>
      asm.builder.addUv(q[0], q[1]),
    );
    asm.builder.addQuad([bottom(j), bottom(j + 1), top(j + 1), top(j)], [uv[0], uv[1], uv[2], uv[3]]);
  }
  const fingerCapBase = side === "left" ? 5 : 10;
  let middleTip = -1;
  for (let j = 1; j <= 4; j += 1) {
    const fingerIndex = j - 1;
    const centerZ = fingerCenterZ(p, fingerIndex);
    const built = leftFingerRings(p, left.knuckleX, fingerIndex, centerZ);
    const coords = mirror ? mirrorRingsX(built.rings) : built.rings;
    const tip: Vec3 = mirror ? [-built.tip[0], built.tip[1], built.tip[2]] : built.tip;
    const rings = asm.addRings(coords, handRegion);
    const holeRing = [bottom(j), bottom(j + 1), top(j + 1), top(j)];
    asm.tube([holeRing, ...rings], fingerBodyRect(side, j));
    const tipIndex = asm.cap(rings[rings.length - 1], tip, capCellRect("skin", fingerCapBase + j), handRegion);
    if (j === 2) middleTip = tipIndex;
  }
  // 엄지: 손바닥1→손바닥2 밴드의 앞면 구멍 [근위-위, 근위-아래, 원위-아래, 원위-위]
  const palm1 = handRings[THUMB_BAND - 1];
  const palm2 = handRings[THUMB_BAND];
  const thumbHole = [palm1[THUMB_COLUMN], palm1[0], palm2[0], palm2[THUMB_COLUMN]];
  const thumb = leftThumbRings(p, leftThumbBase(p));
  const thumbCoords = mirror ? mirrorRingsX(thumb.rings) : thumb.rings;
  const thumbTip: Vec3 = mirror ? [-thumb.tip[0], thumb.tip[1], thumb.tip[2]] : thumb.tip;
  const thumbRings = asm.addRings(thumbCoords, handRegion);
  asm.tube([thumbHole, ...thumbRings], fingerBodyRect(side, 0));
  asm.cap(thumbRings[thumbRings.length - 1], thumbTip, capCellRect("skin", fingerCapBase), handRegion);
  return { upperArmMidRing: armRings[2], middleFingerTip: middleTip };
}

function leftLegRings(p: BodyProportions): { leg: Vec3[][]; foot: Vec3[][]; sole: Vec3 } {
  const cx = p.legJointX;
  const kneeY = p.ankleY + p.lowerLegLength;
  const thigh = p.thighRadius;
  const leg: Vec3[][] = [
    legRing(cx, p.crotchY - 0.03 * p.scale, 0, thigh, thigh * 1.1, CROTCH_ANGLES),
    legRing(cx, p.crotchY - 0.09 * p.scale, 0, thigh * 0.98, thigh * 1.05, lerpAngles(0.5)),
    legRing(cx, kneeY + p.upperLegLength * 0.45, 0, thigh * 0.93, thigh * 0.97, UNIFORM_LEG_ANGLES),
    legRing(cx, kneeY + p.upperLegLength * 0.2, 0, thigh * 0.85, thigh * 0.85, UNIFORM_LEG_ANGLES),
    legRing(cx, kneeY + 0.03 * p.scale, 0, p.kneeRadius * 1.05, p.kneeRadius * 1.08, UNIFORM_LEG_ANGLES),
    legRing(cx, kneeY - 0.03 * p.scale, 0, p.kneeRadius, p.kneeRadius, UNIFORM_LEG_ANGLES),
    legRing(cx, p.ankleY + p.lowerLegLength * 0.68, 0, p.calfRadius * 1.05, p.calfRadius * 1.1, UNIFORM_LEG_ANGLES),
    legRing(cx, p.ankleY + p.lowerLegLength * 0.42, 0, p.calfRadius * 0.85, p.calfRadius * 0.9, UNIFORM_LEG_ANGLES),
    legRing(cx, p.ankleY + 0.03 * p.scale, 0, p.ankleRadius, p.ankleRadius * 1.05, UNIFORM_LEG_ANGLES),
  ];
  const foot: Vec3[][] = [
    legRing(cx, p.ankleY, 0, p.ankleRadius * 1.05, p.ankleRadius * 1.2, UNIFORM_LEG_ANGLES),
    legRing(cx, p.ankleY * 0.55, 0.005 * p.scale, p.footHalfWidth * 0.95, 0.06 * p.scale, UNIFORM_LEG_ANGLES),
    legRing(cx, p.ankleY * 0.22, 0.035 * p.scale, p.footHalfWidth, p.footLength * 0.43, UNIFORM_LEG_ANGLES),
  ];
  return { leg, foot, sole: [cx, 0, 0.035 * p.scale] };
}

function buildLeg(asm: CageAssembler, p: BodyProportions, side: Side, loop: readonly number[]): { thighRing: readonly number[]; sole: number } {
  const mirror = side === "right";
  const left = leftLegRings(p);
  const legCoords = mirror ? mirrorRingsX(left.leg) : left.leg;
  const footCoords = mirror ? mirrorRingsX(left.foot) : left.foot;
  const legRegion = REGION(side === "left" ? "leftLeg" : "rightLeg");
  const footRegion = REGION(side === "left" ? "leftFoot" : "rightFoot");
  const legRings = asm.addRings(legCoords, legRegion);
  const footRings = asm.addRings(footCoords, footRegion);
  asm.tube([loop, ...legRings, ...footRings], side === "left" ? UV_ISLANDS.leftLeg : UV_ISLANDS.rightLeg);
  const sole: Vec3 = mirror ? [-left.sole[0], left.sole[1], left.sole[2]] : left.sole;
  const soleIndex = asm.cap(footRings[footRings.length - 1], sole, capCellRect("skin", side === "left" ? 1 : 2), footRegion);
  return { thighRing: legRings[2], sole: soleIndex };
}

/** 스펙 공개 API: 체형 파라미터로 몸 케이지(닫힌 쿼드 다양체)를 만든다. 토폴로지는 파라미터와 무관하다. */
export function buildBodyCage(params: ParamValues<BodyParamKey>): BodyCage {
  const p = resolveProportions(params);
  const asm = new CageAssembler();
  const specs = torsoRingSpecs(p);
  const torsoRings = specs.map((spec) =>
    asm.builder.addVertices(symmetricRingXZ(TORSO_COLUMNS, [0, spec.y, 0], spec.rx, spec.rz, spec.square ? torsoShape(spec.square) : undefined), spec.region),
  );
  asm.tube(torsoRings, UV_ISLANDS.torso, {
    skip: (j, k) => j >= HOLE_ROW0 && j < HOLE_ROW0 + HOLE_HEIGHT && (LEFT_HOLE_QUAD_COLS.has(k) || RIGHT_HOLE_QUAD_COLS.has(k)),
  });
  const neckCap = asm.cap(
    torsoRings[torsoRings.length - 1],
    [0, p.neckBaseY + p.neckLength + 0.07 * p.scale, 0],
    capCellRect("skin", 0),
    REGION("neck"),
  );
  const leftArm = buildArm(asm, p, "left", holeLoop(torsoRings, (c) => c));
  const rightArm = buildArm(asm, p, "right", holeLoop(torsoRings, mirrorColumn));

  // 가랑이 Y분기
  const crotchRing = torsoRings[0];
  const crotch = asm.builder.addVertex([0, p.crotchY - 0.025 * p.scale, 0], REGION("hips"));
  const half = TORSO_COLUMNS / 2;
  const leftLoop: number[] = [];
  for (let c = 0; c <= half; c += 1) leftLoop.push(crotchRing[c]);
  leftLoop.push(crotch);
  const rightLoop: number[] = [];
  for (let c = 0; c <= half; c += 1) rightLoop.push(crotchRing[mirrorColumn(c)]);
  rightLoop.push(crotch);
  const leftLeg = buildLeg(asm, p, "left", leftLoop);
  const rightLeg = buildLeg(asm, p, "right", rightLoop);

  // 어깨 구멍 내부 정점(면에 쓰이지 않음)은 압축되어 사라지므로 랜드마크 인덱스를 맵으로 변환한다.
  const { mesh, vertexMap } = asm.builder.buildWithMap();
  const remap = (index: number): number => {
    const mapped = vertexMap[index];
    if (mapped < 0) throw new Error(`랜드마크 정점 ${index}가 면에 쓰이지 않았습니다.`);
    return mapped;
  };
  const remapRing = (ring: readonly number[]): number[] => ring.map(remap);
  return {
    mesh,
    proportions: p,
    landmarks: {
      leftUpperArmRing: remapRing(leftArm.upperArmMidRing),
      rightUpperArmRing: remapRing(rightArm.upperArmMidRing),
      leftThighRing: remapRing(leftLeg.thighRing),
      rightThighRing: remapRing(rightLeg.thighRing),
      crotch: remap(crotch),
      neckCap: remap(neckCap),
      leftMiddleFingerTip: remap(leftArm.middleFingerTip),
      rightMiddleFingerTip: remap(rightArm.middleFingerTip),
      leftSole: remap(leftLeg.sole),
      rightSole: remap(rightLeg.sole),
    },
  };
}

/** 영역 태그가 없는 정점 수(테스트용) */
export function countUntaggedVertices(mesh: QuadMesh): number {
  let count = 0;
  for (let i = 0; i < mesh.regions.length; i += 1) if (mesh.regions[i] === NO_REGION) count += 1;
  return count;
}
