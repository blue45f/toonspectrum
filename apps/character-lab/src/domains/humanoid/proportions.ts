/**
 * 체형 비례: 체형 파라미터 9종([-1, 1])을 실제 측정값(m)으로 바꾼다.
 *
 * 케이지(geometry/cage.ts)·스켈레톤(skeleton/skeleton-builder.ts)·작은 파츠(눈·치아 등)가 모두 이 값에서
 * 좌표를 얻으므로, 파라미터가 바뀌어도 토폴로지는 고정되고 위치만 변한다(morph 델타 호환).
 * 좌표계: 우수·Y-up·+x = 캐릭터 왼쪽(VRM), 발바닥 y=0, T-포즈(팔은 ±x로 수평, 손바닥 아래).
 * 원리 참고: Hyun 2005(스윕 로프트), SMPL 구조(형상 후 관절 회귀, 개념만), Anny(표현형 → 보간) — 코드 복제 없음.
 */
import { clampParam, type BodyParamKey, type ParamValues } from "../../contracts";

import type { Vec3 } from "../../shared/math";

/** 기본 키(m). 7등신 스타일. */
export const BASE_HEIGHT = 1.62;

export interface FingerLengths {
  readonly proximal: number;
  readonly intermediate: number;
  readonly distal: number;
}

export interface HeadFrame {
  /** 머리 중심(모델 공간, m) */
  readonly center: Vec3;
  /** 머리 로컬(단위 반경 ≈ 1) → 모델 공간 배율(m) */
  readonly scale: number;
}

export interface BodyProportions {
  /** 전신 배율(height 파라미터, 1 = 기본) */
  readonly scale: number;
  readonly height: number;
  // ---- 몸통 높이(m)
  readonly crotchY: number;
  readonly hipJointY: number;
  readonly hipsBoneY: number;
  readonly spineY: number;
  readonly chestBoneY: number;
  readonly upperChestBoneY: number;
  readonly shoulderJointY: number;
  readonly neckBaseY: number;
  readonly neckLength: number;
  // ---- 몸통 단면 반폭(x)·반깊이(z)
  readonly hipHalfWidth: number;
  readonly hipDepth: number;
  readonly waistHalfWidth: number;
  readonly waistDepth: number;
  readonly chestHalfWidth: number;
  readonly chestDepth: number;
  readonly shoulderHalfWidth: number;
  readonly shoulderDepth: number;
  readonly neckRadius: number;
  // ---- 팔
  readonly shoulderJointX: number;
  readonly upperArmLength: number;
  readonly lowerArmLength: number;
  readonly upperArmRadius: number;
  readonly elbowRadius: number;
  readonly wristRadius: number;
  readonly palmLength: number;
  readonly handWidth: number;
  readonly handThickness: number;
  readonly fingerRadius: number;
  /** 검지·중지·약지·소지 */
  readonly fingers: readonly [FingerLengths, FingerLengths, FingerLengths, FingerLengths];
  readonly thumb: FingerLengths;
  // ---- 다리
  readonly legJointX: number;
  readonly upperLegLength: number;
  readonly lowerLegLength: number;
  readonly ankleY: number;
  readonly thighRadius: number;
  readonly kneeRadius: number;
  readonly calfRadius: number;
  readonly ankleRadius: number;
  readonly footLength: number;
  readonly footHalfWidth: number;
  // ---- 머리
  readonly head: HeadFrame;
}

function param(values: ParamValues<BodyParamKey>, key: BodyParamKey): number {
  return clampParam(values[key] ?? 0);
}

/** 체형 파라미터 → 비례. 모든 값은 결정적이며 파라미터에 대해 연속이다. */
export function resolveProportions(values: ParamValues<BodyParamKey>): BodyProportions {
  const height = param(values, "height");
  const shoulderWidth = param(values, "shoulderWidth");
  const chestDepth = param(values, "chestDepth");
  const waist = param(values, "waist");
  const hip = param(values, "hip");
  const armLength = param(values, "armLength");
  const legLength = param(values, "legLength");
  const headSize = param(values, "headSize");
  const neckLength = param(values, "neckLength");

  const scale = 1 + 0.08 * height;
  const legFactor = 1 + 0.1 * legLength;
  const ankleY = 0.08;
  const lowerLegLength = 0.39 * legFactor;
  const upperLegLength = 0.39 * legFactor;
  const hipJointY = ankleY + lowerLegLength + upperLegLength;
  const hipsBoneY = hipJointY + 0.04;
  const crotchY = hipJointY - 0.08;
  const spineY = hipsBoneY + 0.09;
  const chestBoneY = hipsBoneY + 0.21;
  const upperChestBoneY = hipsBoneY + 0.33;
  const shoulderJointY = hipsBoneY + 0.47;
  const neckBaseY = hipsBoneY + 0.57;
  const neckLen = 0.06 * (1 + 0.4 * neckLength);
  const headScale = 0.105 * (1 + 0.12 * headSize);
  const headCenterY = neckBaseY + neckLen;

  const armFactor = 1 + 0.12 * armLength;
  const shoulderFactor = 1 + 0.2 * shoulderWidth;

  const s = (v: number): number => v * scale;
  const finger = (p: number, i: number, d: number): FingerLengths => ({ proximal: s(p), intermediate: s(i), distal: s(d) });

  return {
    scale,
    height: s(headCenterY + headScale * 1.05),
    crotchY: s(crotchY),
    hipJointY: s(hipJointY),
    hipsBoneY: s(hipsBoneY),
    spineY: s(spineY),
    chestBoneY: s(chestBoneY),
    upperChestBoneY: s(upperChestBoneY),
    shoulderJointY: s(shoulderJointY),
    neckBaseY: s(neckBaseY),
    neckLength: s(neckLen),
    hipHalfWidth: s(0.155 * (1 + 0.2 * hip)),
    hipDepth: s(0.105 * (1 + 0.15 * hip)),
    waistHalfWidth: s(0.115 * (1 + 0.2 * waist)),
    waistDepth: s(0.085 * (1 + 0.2 * waist)),
    chestHalfWidth: s(0.14 * (1 + 0.1 * chestDepth + 0.1 * shoulderWidth)),
    chestDepth: s(0.1 * (1 + 0.25 * chestDepth)),
    shoulderHalfWidth: s(0.165 * shoulderFactor),
    shoulderDepth: s(0.095 * (1 + 0.1 * chestDepth)),
    neckRadius: s(0.048),
    shoulderJointX: s(0.17 * shoulderFactor),
    upperArmLength: s(0.26 * armFactor),
    lowerArmLength: s(0.24 * armFactor),
    upperArmRadius: s(0.04),
    elbowRadius: s(0.034),
    wristRadius: s(0.024),
    palmLength: s(0.085),
    handWidth: s(0.085),
    handThickness: s(0.026),
    fingerRadius: s(0.0085),
    fingers: [finger(0.038, 0.024, 0.02), finger(0.042, 0.027, 0.021), finger(0.038, 0.025, 0.02), finger(0.03, 0.019, 0.017)],
    thumb: finger(0.04, 0.03, 0.025),
    legJointX: s(0.085 * (1 + 0.15 * hip)),
    upperLegLength: s(upperLegLength),
    lowerLegLength: s(lowerLegLength),
    ankleY: s(ankleY),
    thighRadius: s(0.075 * (1 + 0.1 * hip)),
    kneeRadius: s(0.052),
    calfRadius: s(0.05),
    ankleRadius: s(0.034),
    footLength: s(0.22),
    footHalfWidth: s(0.04),
    head: { center: [0, s(headCenterY), 0], scale: s(headScale) },
  };
}

/** 손 끝 링에서 손가락이 차지하지 않는 가장자리 비율(손 너비 기준) */
export const HAND_END_MARGIN_RATIO = 0.075;

/** 왼손 손가락 중심 z(앞=+z). fingerIndex 0=검지 … 3=소지. 손 끝 캡의 구멍 칸(j=fingerIndex+1) 중심과 같다. */
export function fingerCenterZ(p: BodyProportions, fingerIndex: number): number {
  const width = p.handWidth;
  const margin = width * HAND_END_MARGIN_RATIO;
  const inner = width - 2 * margin;
  const j = fingerIndex + 1;
  const z0 = width / 2 - margin - (inner * (j - 1)) / 4;
  const z1 = width / 2 - margin - (inner * j) / 4;
  return (z0 + z1) / 2;
}

/** 왼손 손목 x(T-포즈) */
export function leftWristX(p: BodyProportions): number {
  return p.shoulderJointX + p.upperArmLength + p.lowerArmLength;
}

/** 왼손 손가락 관절(너클) x */
export function leftKnuckleX(p: BodyProportions): number {
  return leftWristX(p) + p.palmLength;
}

/** 왼손 엄지 기부(손 앞면 구멍 중심, 손바닥 링 0.85·너비와 1.0·너비의 평균) */
export function leftThumbBase(p: BodyProportions): Vec3 {
  return [leftWristX(p) + 0.04 * p.scale, p.shoulderJointY, (p.handWidth * (0.85 + 1)) / 4];
}

/** 왼손 엄지 축(단위): 앞(+z)·바깥(+x)·약간 아래 */
export const LEFT_THUMB_AXIS: Vec3 = (() => {
  const v: Vec3 = [0.45, -0.2, 0.85];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

/** 머리 로컬 좌표(단위 반경) → 모델 공간 */
export function headLocalToWorld(frame: HeadFrame, p: Vec3): Vec3 {
  return [frame.center[0] + p[0] * frame.scale, frame.center[1] + p[1] * frame.scale, frame.center[2] + p[2] * frame.scale];
}

/** 모델 공간 → 머리 로컬 좌표 */
export function worldToHeadLocal(frame: HeadFrame, p: Vec3): Vec3 {
  return [(p[0] - frame.center[0]) / frame.scale, (p[1] - frame.center[1]) / frame.scale, (p[2] - frame.center[2]) / frame.scale];
}

/**
 * 머리 프레임 A에서 B로의 유사 변환이 점 p(프레임 A의 모델 공간)에 주는 변위.
 * 체형 morph가 머리에 붙은 작은 파츠(눈·치아·눈썹)를 머리 케이지와 정확히 같은 방식으로 옮기는 데 쓴다.
 */
export function headFrameDelta(from: HeadFrame, to: HeadFrame, p: Vec3): Vec3 {
  const k = to.scale / from.scale;
  return [
    to.center[0] + (p[0] - from.center[0]) * k - p[0],
    to.center[1] + (p[1] - from.center[1]) * k - p[1],
    to.center[2] + (p[2] - from.center[2]) * k - p[2],
  ];
}

/** 머리 로컬 좌표 기준 얼굴 랜드마크(단위 반경 공간, 좌우 대칭은 x 부호). */
export const HEAD_LANDMARKS = {
  /** 왼눈 중심(안구 중심). 안구 앞면이 눈 소켓 바닥보다 0.03만큼 앞에 온다. */
  eye: [0.33, 0.1, 0.6] as Vec3,
  eyeballRadius: 0.19,
  /** 눈썹 중심 */
  brow: [0.36, 0.33, 0.8] as Vec3,
  noseTip: [0, -0.12, 0.98] as Vec3,
  noseBridge: [0, 0.08, 0.86] as Vec3,
  /** 입선 중심(입 구멍 위·아래 입술의 가운데). head-cage의 `mouthWarp`·턱 마스크·입 FACS 필드의 기준 y다. */
  mouth: [0, -0.43, 0.78] as Vec3,
  /** 입꼬리 x(입 구멍 가장자리 반폭과 같다: 경도 열 14·18) */
  mouthHalfWidth: 0.3,
  chin: [0, -0.92, 0.42] as Vec3,
  jawCorner: [0.62, -0.5, 0.1] as Vec3,
  cheek: [0.7, -0.2, 0.42] as Vec3,
  forehead: [0, 0.55, 0.7] as Vec3,
  /** 왼귀 기부 중심 */
  ear: [0.86, 0.0, -0.05] as Vec3,
  /** 턱 관절(jaw 본) */
  jawPivot: [0, -0.3, -0.1] as Vec3,
  /** 두피(헤어 앵커) 경계: 이 y 위 또는 뒤통수 */
  scalpMinY: 0.3,
} as const;
