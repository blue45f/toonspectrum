/**
 * 얼굴 파라미터 15종·FACS 16 유닛의 해석 변위 필드(머리 로컬 단위 반경 공간).
 *
 * 각 필드는 (로컬 점, 스코프) → 로컬 변위를 돌려주며 x 부호·|x| 기반 마스크만 쓰므로 좌우 대칭이 구성적으로 보장된다.
 * 스코프: "surface"(머리·눈썹·속눈썹 = 머리 표면 위 정점, 거리 falloff 마스크), "eye-left"/"eye-right"(안구 4파츠 = 강체),
 * "teeth"/"tongue"(턱 열림·혀 내밀기만). 파라미터 "−" 방향은 "+"의 부호 반전이다.
 * 원리: Lewis 2014 델타 블렌드셰이프, ARKit/ICT-FaceKit 명명(개념만).
 */
import { HEAD_LANDMARKS } from "../proportions";

import type { FaceParamKey, FacsUnit } from "../../../contracts";
import type { Vec3 } from "../../../shared/math";

export type FaceMorphScope = "surface" | "eye-left" | "eye-right" | "teeth" | "tongue";

export type FaceField = (p: Vec3, scope: FaceMorphScope) => Vec3;

const ZERO: Vec3 = [0, 0, 0];
const L = HEAD_LANDMARKS;
const MOUTH_Y = L.mouth[1];

function gaussian(d2: number, sigma: number): number {
  return Math.exp(-d2 / (2 * sigma * sigma));
}

function dist2(p: Vec3, c: Vec3): number {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const dz = p[2] - c[2];
  return dx * dx + dy * dy + dz * dz;
}

/** 특징점 c 근방 가우시안 마스크 */
export function near(p: Vec3, c: Vec3, sigma: number): number {
  return gaussian(dist2(p, c), sigma);
}

/**
 * 좌우 대칭 특징(c와 거울 c′)의 확률적 합집합 1 − (1−a)(1−b). max와 달리 정중선(x = 0)에서 미분이 연속이라
 * 입꼬리·눈 같은 마스크가 코·입 가운데에 뾰족한 꺾임(V자)을 만들지 않는다.
 */
export function nearMirrored(p: Vec3, c: Vec3, sigma: number): number {
  const a = near(p, c, sigma);
  const b = near(p, [-c[0], c[1], c[2]], sigma);
  return a + b - a * b;
}

function smooth01(x: number, edge0: number, edge1: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 좌우 방향 계수: 정중선에서 0, 양쪽에서 ±1(대칭 보존) */
function lateral(x: number, width = 0.08): number {
  return Math.max(-1, Math.min(1, x / width));
}

function sideSign(x: number): number {
  return x >= 0 ? 1 : -1;
}

/** 위·아래 입술 계수(입 중심선에서 0) */
function lipSign(y: number): number {
  return Math.max(-1, Math.min(1, (y - MOUTH_Y) / 0.05));
}

/**
 * x 쪽 눈 중심. 정중선(|x| < 0.06) 근처에서는 중심 x를 선형으로 0까지 줄여 변위의 x 성분이 x에 대해 홀함수가 되게 한다
 * (정중선 정점이 한쪽 눈으로 쏠리면 거울 대칭이 깨진다).
 */
function eyeCenterFor(x: number): Vec3 {
  return [lateral(x, 0.06) * L.eye[0], L.eye[1], L.eye[2]];
}

/** 컴팩트 서포트 마스크 (1 − (d/R)²)². d ≥ R이면 정확히 0이라 정중선 등 먼 정점에 새지 않는다. */
function bump(p: Vec3, c: Vec3, radius: number): number {
  const t = dist2(p, c) / (radius * radius);
  return t >= 1 ? 0 : (1 - t) * (1 - t);
}

/** 좌우 대칭 특징(c와 거울 c′ 중 가까운 쪽)의 컴팩트 서포트 마스크 */
function bumpMirrored(p: Vec3, c: Vec3, radius: number): number {
  return Math.max(bump(p, c, radius), bump(p, [-c[0], c[1], c[2]], radius));
}

function scopeSide(scope: FaceMorphScope): number | null {
  if (scope === "eye-left") return 1;
  if (scope === "eye-right") return -1;
  return null;
}

/** 축 회전 변위: 점 p를 중심 c 기준으로 축(axis: 0=x, 1=y, 2=z) 둘레로 θ 회전했을 때의 변위 */
function rotationDelta(p: Vec3, c: Vec3, axis: 0 | 1 | 2, theta: number): Vec3 {
  const d: [number, number, number] = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const out: [number, number, number] = [0, 0, 0];
  if (axis === 0) {
    out[1] = d[1] * cos - d[2] * sin - d[1];
    out[2] = d[1] * sin + d[2] * cos - d[2];
  } else if (axis === 1) {
    out[0] = d[0] * cos + d[2] * sin - d[0];
    out[2] = -d[0] * sin + d[2] * cos - d[2];
  } else {
    out[0] = d[0] * cos - d[1] * sin - d[0];
    out[1] = d[0] * sin + d[1] * cos - d[1];
  }
  return out;
}

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function radial(p: Vec3, k: number): Vec3 {
  const len = Math.hypot(p[0], p[1], p[2]) || 1;
  return [(p[0] / len) * k, (p[1] / len) * k, (p[2] / len) * k];
}

/** 눈 강체 변위(안구 스코프): 크기·간격·기울기 */
function eyeRigid(p: Vec3, side: number, kind: "size" | "spacing" | "tilt"): Vec3 {
  const c: Vec3 = [side * L.eye[0], L.eye[1], L.eye[2]];
  if (kind === "size") return scale([p[0] - c[0], p[1] - c[1], p[2] - c[2]], 0.2);
  if (kind === "spacing") return [0.08 * side, 0, 0];
  return rotationDelta(p, c, 2, side * 0.25);
}

const NOSE_WING: Vec3 = [0.16, -0.18, 0.88];
const MOUTH_CORNER: Vec3 = [L.mouthHalfWidth, L.mouth[1], 0.76];
/** 입꼬리 마스크 반경: 가운데는 거의 움직이지 않고 꼬리만 올라/내려가게 한다(치아·입 안 바닥이 피부를 뚫지 않게). */
const MOUTH_CORNER_SIGMA = 0.15;
const EAR_CENTER: Vec3 = [L.ear[0] + 0.06, L.ear[1], L.ear[2]];
/** 귀 마스크 반경(귀 케이지 반경 0.3 + 주변 피부). 정중선(x=0)까지 거리(0.92)보다 작아 대칭이 구성적으로 보장된다. */
const EAR_MASK_RADIUS = 0.6;
/** 눈 주변 마스크 반경(컴팩트 서포트): 눈썹·눈꺼풀까지 닿고 코·입·볼에는 새지 않는다. */
const EYE_MASK_RADIUS = 0.55;
const UPPER_LID: Vec3 = [L.eye[0], 0.26, 0.78];
const LOWER_LID: Vec3 = [L.eye[0], -0.06, 0.78];
const BROW_INNER: Vec3 = [0.18, 0.33, 0.82];
const BROW_OUTER: Vec3 = [0.5, 0.33, 0.68];
const CHEEK_PUFF: Vec3 = [0.55, -0.35, 0.55];

/**
 * 치아·혀("teeth"/"tongue" 스코프)는 입 안 공동 벽(머리 표면)과 같은 필드로 움직여야 얼굴 파라미터·표정에서 피부를 뚫지 않는다
 * (정중선 가까운 입 안은 벽과 필드 차이가 작다). 전용 처리가 있는 필드(턱 열림·입 오므림·혀 내밀기)만 예외로 둔다.
 */
function innerFollowsSurface(field: FaceField): FaceField {
  return (p, scope) => field(p, scope === "teeth" || scope === "tongue" ? "surface" : scope);
}

function followInner<K extends string>(defs: Readonly<Record<K, FaceField>>, own: readonly NoInfer<K>[] = []): Readonly<Record<K, FaceField>> {
  const out = {} as Record<K, FaceField>;
  for (const key of Object.keys(defs) as K[]) out[key] = own.includes(key) ? defs[key] : innerFollowsSurface(defs[key]);
  return out;
}

const FACE_PARAM_FIELD_DEFS: Readonly<Record<FaceParamKey, FaceField>> = {
  faceShape: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = smooth01(-p[1], -0.1, 0.7) * smooth01(p[2], -0.6, -0.1);
    return [0.12 * p[0] * m, 0.06 * m * Math.max(0, -p[1]), 0];
  },
  jawWidth: (p, scope) => (scope === "surface" ? [0.15 * lateral(p[0]) * nearMirrored(p, L.jawCorner, 0.45), 0, 0] : ZERO),
  chinLength: (p, scope) => {
    if (scope !== "surface") return ZERO;
    // 턱 아래쪽(입선 아래, 입술 높이 아래부터 턱 끝으로 갈수록 커짐)만 움직여 입·윗니·입 안 바닥이 따라 움직이지 않는다
    const m = jawMaskLocal(p) * smooth01(-p[1], 0.5, 0.95);
    return [0, -0.15 * m, 0.03 * m];
  },
  cheekVolume: (p, scope) => (scope === "surface" ? radial(p, 0.1 * nearMirrored(p, L.cheek, 0.4)) : ZERO),
  forehead: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = bump(p, L.forehead, 0.55);
    return [0, 0.04 * m, 0.1 * m];
  },
  eyeSize: (p, scope) => {
    const side = scopeSide(scope);
    if (side !== null) return eyeRigid(p, side, "size");
    if (scope !== "surface") return ZERO;
    const c = eyeCenterFor(p[0]);
    return scale([p[0] - c[0], p[1] - c[1], p[2] - c[2]], 0.2 * bumpMirrored(p, L.eye, EYE_MASK_RADIUS));
  },
  eyeSpacing: (p, scope) => {
    const side = scopeSide(scope);
    if (side !== null) return eyeRigid(p, side, "spacing");
    if (scope !== "surface") return ZERO;
    return [0.08 * lateral(p[0]) * bumpMirrored(p, L.eye, EYE_MASK_RADIUS + 0.05), 0, 0];
  },
  eyeTilt: (p, scope) => {
    const side = scopeSide(scope);
    if (side !== null) return eyeRigid(p, side, "tilt");
    if (scope !== "surface") return ZERO;
    const m = bumpMirrored(p, L.eye, EYE_MASK_RADIUS);
    return rotationDelta(p, eyeCenterFor(p[0]), 2, sideSign(p[0]) * 0.25 * m * Math.abs(lateral(p[0], 0.05)));
  },
  noseHeight: (p, scope) => (scope === "surface" ? [0, 0.12 * bump(p, [0, -0.05, 0.92], 0.4), 0] : ZERO),
  noseWidth: (p, scope) => (scope === "surface" ? [0.1 * lateral(p[0]) * bumpMirrored(p, NOSE_WING, 0.3), 0, 0] : ZERO),
  noseDepth: (p, scope) => (scope === "surface" ? [0, 0, 0.14 * bump(p, L.noseTip, 0.35)] : ZERO),
  mouthWidth: (p, scope) => (scope === "surface" ? [0.1 * lateral(p[0]) * nearMirrored(p, MOUTH_CORNER, 0.22), 0, 0] : ZERO),
  lipFullness: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = near(p, L.mouth, 0.25);
    return [0, 0.03 * lipSign(p[1]) * m, 0.08 * m];
  },
  earSize: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = bumpMirrored(p, EAR_CENTER, EAR_MASK_RADIUS);
    const base: Vec3 = [sideSign(p[0]) * L.ear[0], L.ear[1], L.ear[2]];
    return scale([p[0] - base[0], p[1] - base[1], p[2] - base[2]], 0.3 * m);
  },
  earAngle: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = bumpMirrored(p, EAR_CENTER, EAR_MASK_RADIUS);
    const base: Vec3 = [sideSign(p[0]) * L.ear[0], L.ear[1], L.ear[2]];
    return rotationDelta(p, base, 1, -sideSign(p[0]) * 0.3 * m);
  },
};

/** 턱 마스크의 세로 전환 반폭: 입 구멍 안(|x| ≤ 0.26)은 위·아래 입술 사이에서 급히, 볼·턱선 쪽은 완만히 */
const JAW_BAND_MIN = 0.016;
const JAW_BAND_SPREAD = 0.2;

/**
 * 턱 마스크(머리 로컬): 입선(L.mouth[1]) 아래 1, 위 0, 귀 쪽(뒤)으로 갈수록 0. 위 입술은 머리, 아래 입술은 턱을 따른다.
 * FACS 턱 열림 필드와 머리 파츠의 jaw 본 스킨 웨이트(`skeleton/jaw-weights.ts`)가 같은 마스크를 쓴다.
 */
export function jawMaskLocal(p: Vec3): number {
  const band = JAW_BAND_MIN + JAW_BAND_SPREAD * smooth01(Math.abs(p[0]), 0.26, 0.6);
  return smooth01(MOUTH_Y - p[1], -band, band) * smooth01(p[2], -0.5, -0.2);
}

function jawRotation(p: Vec3, m: number, angle = 0.35): Vec3 {
  return rotationDelta(p, L.jawPivot, 0, angle * m);
}

function blink(p: Vec3, scope: FaceMorphScope, side: number): Vec3 {
  if (scope !== "surface") return ZERO;
  if (sideSign(p[0]) !== side || Math.abs(p[0]) < 0.03) return ZERO;
  const upper: Vec3 = [side * UPPER_LID[0], UPPER_LID[1], UPPER_LID[2]];
  const lower: Vec3 = [side * LOWER_LID[0], LOWER_LID[1], LOWER_LID[2]];
  const mu = near(p, upper, 0.22);
  const ml = near(p, lower, 0.16);
  return [0, -0.2 * mu + 0.04 * ml, 0.02 * mu];
}

const FACS_FIELD_DEFS: Readonly<Record<FacsUnit, FaceField>> = {
  browInnerUp: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = nearMirrored(p, BROW_INNER, 0.22);
    return [0, 0.1 * m, 0.01 * m];
  },
  browOuterUp: (p, scope) => (scope === "surface" ? [0, 0.1 * nearMirrored(p, BROW_OUTER, 0.22), 0] : ZERO),
  browDown: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = nearMirrored(p, L.brow, 0.3);
    return [-0.02 * lateral(p[0]) * m, -0.1 * m, 0];
  },
  eyeBlinkLeft: (p, scope) => blink(p, scope, 1),
  eyeBlinkRight: (p, scope) => blink(p, scope, -1),
  eyeWide: (p, scope) => {
    if (scope !== "surface") return ZERO;
    return [0, 0.08 * nearMirrored(p, UPPER_LID, 0.2) + 0.03 * nearMirrored(p, L.brow, 0.25), 0];
  },
  eyeSquint: (p, scope) => {
    if (scope !== "surface") return ZERO;
    return [0, 0.07 * nearMirrored(p, LOWER_LID, 0.18) - 0.03 * nearMirrored(p, UPPER_LID, 0.2), 0];
  },
  cheekPuff: (p, scope) => (scope === "surface" ? radial(p, 0.14 * nearMirrored(p, CHEEK_PUFF, 0.4)) : ZERO),
  noseSneer: (p, scope) => (scope === "surface" ? [0, 0.08 * nearMirrored(p, [NOSE_WING[0], -0.15, NOSE_WING[2]], 0.22), 0] : ZERO),
  jawOpen: (p, scope) => {
    if (scope === "surface") return jawRotation(p, jawMaskLocal(p));
    if (scope === "teeth") return p[1] < MOUTH_Y ? jawRotation(p, 1) : ZERO;
    if (scope === "tongue") return jawRotation(p, 1);
    return ZERO;
  },
  mouthSmile: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = nearMirrored(p, MOUTH_CORNER, MOUTH_CORNER_SIGMA);
    return [0.06 * lateral(p[0]) * m, 0.08 * m, -0.02 * m];
  },
  mouthFrown: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = nearMirrored(p, MOUTH_CORNER, MOUTH_CORNER_SIGMA);
    return [0.02 * lateral(p[0]) * m, -0.08 * m, 0];
  },
  mouthPucker: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = near(p, L.mouth, 0.28);
    return [-0.08 * lateral(p[0], 0.15) * m, 0, 0.1 * m];
  },
  mouthFunnel: (p, scope) => {
    if (scope === "teeth") return p[1] < MOUTH_Y ? jawRotation(p, 1, 0.08) : ZERO;
    if (scope === "tongue") return jawRotation(p, 1, 0.08);
    if (scope !== "surface") return ZERO;
    const m = near(p, L.mouth, 0.3);
    return add([0, 0.06 * lipSign(p[1]) * m, 0.1 * m], jawRotation(p, jawMaskLocal(p), 0.08));
  },
  mouthPress: (p, scope) => {
    if (scope !== "surface") return ZERO;
    const m = near(p, L.mouth, 0.25);
    return [0, -0.03 * lipSign(p[1]) * m, -0.04 * m];
  },
  tongueOut: (p, scope) => {
    if (scope === "tongue") return [0, -0.02, 0.35];
    if (scope !== "surface") return ZERO;
    return [0, 0.04 * lipSign(p[1]) * near(p, L.mouth, 0.2), 0];
  },
};

export const FACE_PARAM_FIELDS: Readonly<Record<FaceParamKey, FaceField>> = followInner(FACE_PARAM_FIELD_DEFS);
/** 턱 열림·입 오므림·혀 내밀기는 치아·혀 전용 처리가 있어 그대로 둔다. */
export const FACS_FIELDS: Readonly<Record<FacsUnit, FaceField>> = followInner(FACS_FIELD_DEFS, ["jawOpen", "mouthFunnel", "tongueOut"]);
