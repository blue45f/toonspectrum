/**
 * 해석적 two-bone IK(팔꿈치·무릎 체인).
 *
 * 원리(코사인 법칙, Aristidou & Lasenby IK survey의 해석적 분류; 코드 복제 없음):
 *   l1 = |mid − root|, l2 = |end − mid|, d = clamp(|target − root|, |l1 − l2| + ε, l1 + l2 − ε)
 *   중간 관절 내각 cosθ = (l1² + l2² − d²) / (2·l1·l2), 루트 각 cosα = (l1² + d² − l2²) / (2·l1·d)
 *   중간 관절은 root→target 축과 pole이 이루는 평면 위에 놓인다(pole이 없으면 현재 굽힘 평면 유지).
 * 결과는 월드 프레임의 델타 회전 두 개다:
 *   rootRotation — root 관절 둘레로 상완(root→mid)을 돌리는 회전(굽힘 평면 법선도 함께 정렬).
 *   midRotation  — rootRotation을 적용한 뒤 mid 관절 둘레로 하완(mid→end)을 돌리는 회전.
 * 도달 불가(너무 멀거나 가까움)·관절 제한 초과 시 가능한 최대 신장/최소 접힘으로 두고 `reached=false`와
 * 한글 사유를 돌려준다(무음 대체 없음).
 */
import {
  clamp,
  degToRad,
  qFromAxisAngle,
  qMultiply,
  qNormalize,
  qRotateVec3,
  quatFromTo,
  v3Add,
  v3AnyPerpendicular,
  v3Cross,
  v3Distance,
  v3Dot,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
  QUAT_IDENTITY,
} from "../shared/math";

import type { Quat, Vec3 } from "../contracts/pose";

export interface TwoBoneIkLimits {
  /** 중간 관절 최소 굽힘각(도, 0 = 곧게 폄) */
  readonly midMinDeg: number;
  /** 중간 관절 최대 굽힘각(도, 180 = 완전히 접힘) */
  readonly midMaxDeg: number;
}

export interface TwoBoneIkInput {
  readonly root: Vec3;
  readonly mid: Vec3;
  readonly end: Vec3;
  readonly target: Vec3;
  /** 중간 관절이 향할 위치(월드). 없으면 현재 굽힘 평면을 유지한다. */
  readonly pole?: Vec3;
  readonly limits?: TwoBoneIkLimits;
}

export type TwoBoneIkStatus = "reached" | "max-reach" | "min-fold" | "limited" | "degenerate";

export interface TwoBoneIkResult {
  readonly rootRotation: Quat;
  readonly midRotation: Quat;
  readonly reached: boolean;
  /** |새 말단 − target| */
  readonly error: number;
  readonly status: TwoBoneIkStatus;
  readonly reasonKo?: string;
  readonly midPosition: Vec3;
  readonly endPosition: Vec3;
  /** 결과 중간 관절 굽힘각(도) */
  readonly midBendDeg: number;
}

/** 도달 판정 허용 오차(모델 단위, 미터) */
export const IK_REACH_TOLERANCE = 1e-4;
const LENGTH_EPSILON = 1e-6;

/**
 * 두 프레임(방향 + 굽힘 평면 법선)을 정렬하는 회전. from 방향을 to 방향으로 돌린 뒤
 * to 방향 둘레로 법선을 맞춘다. 법선이 퇴화(0)면 방향만 정렬한다.
 */
export function rotationBetweenFrames(fromDir: Vec3, fromNormal: Vec3, toDir: Vec3, toNormal: Vec3): Quat {
  const f = v3Normalize(fromDir);
  const t = v3Normalize(toDir);
  const align = quatFromTo(f, t);
  const fn = v3Normalize(fromNormal);
  const tn = v3Normalize(toNormal);
  if (v3Length(fn) === 0 || v3Length(tn) === 0) return align;
  const rotatedNormal = qRotateVec3(align, fn);
  // t에 수직한 성분만 비교한다(법선은 정의상 방향에 수직).
  const a = v3Normalize(v3Sub(rotatedNormal, v3Scale(t, v3Dot(rotatedNormal, t))));
  const b = v3Normalize(v3Sub(tn, v3Scale(t, v3Dot(tn, t))));
  if (v3Length(a) === 0 || v3Length(b) === 0) return align;
  const cos = clamp(v3Dot(a, b), -1, 1);
  const sin = v3Dot(v3Cross(a, b), t);
  const angle = Math.atan2(sin, cos);
  return qNormalize(qMultiply(qFromAxisAngle(t, angle), align));
}

function degenerate(input: TwoBoneIkInput, reasonKo: string): TwoBoneIkResult {
  return {
    rootRotation: QUAT_IDENTITY,
    midRotation: QUAT_IDENTITY,
    reached: false,
    error: v3Distance(input.end, input.target),
    status: "degenerate",
    reasonKo,
    midPosition: input.mid,
    endPosition: input.end,
    midBendDeg: 0,
  };
}

export function solveTwoBoneIk(input: TwoBoneIkInput): TwoBoneIkResult {
  const { root, mid, end, target } = input;
  const upper = v3Sub(mid, root);
  const lower = v3Sub(end, mid);
  const l1 = v3Length(upper);
  const l2 = v3Length(lower);
  if (l1 < LENGTH_EPSILON || l2 < LENGTH_EPSILON) {
    return degenerate(input, "IK 체인의 본 길이가 0이라 풀 수 없습니다.");
  }
  if (![root, mid, end, target].every((v) => v.every(Number.isFinite))) {
    return degenerate(input, "IK 입력에 유한하지 않은 좌표가 있습니다.");
  }

  const toTarget = v3Sub(target, root);
  const rawDistance = v3Length(toTarget);
  // 목표가 루트와 겹치면 현재 상완 방향을 축으로 쓴다(방향을 정의할 수 없으므로).
  const axis = rawDistance < LENGTH_EPSILON ? v3Normalize(upper) : v3Scale(toTarget, 1 / rawDistance);

  const minDistance = Math.abs(l1 - l2) + LENGTH_EPSILON;
  const maxDistance = l1 + l2 - LENGTH_EPSILON;
  let distance = clamp(rawDistance, minDistance, maxDistance);
  let status: TwoBoneIkStatus = "reached";
  let reasonKo: string | undefined;
  if (rawDistance > maxDistance) {
    status = "max-reach";
    reasonKo = `목표가 체인 최대 신장(${(l1 + l2).toFixed(3)} m)보다 멀어 최대로 뻗었습니다.`;
  } else if (rawDistance < minDistance) {
    status = "min-fold";
    reasonKo = "목표가 너무 가까워 최소 접힘으로 제한했습니다.";
  }

  // 중간 관절 굽힘각 β(0 = 곧게 폄): cos(π − β) = (l1² + l2² − d²)/(2 l1 l2)
  let interiorCos = clamp((l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2), -1, 1);
  let bend = Math.PI - Math.acos(interiorCos);
  if (input.limits) {
    const minBend = degToRad(clamp(input.limits.midMinDeg, 0, 180));
    const maxBend = degToRad(clamp(input.limits.midMaxDeg, 0, 180));
    const clampedBend = clamp(bend, Math.min(minBend, maxBend), Math.max(minBend, maxBend));
    if (Math.abs(clampedBend - bend) > 1e-9) {
      bend = clampedBend;
      interiorCos = Math.cos(Math.PI - bend);
      distance = Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * interiorCos));
      status = "limited";
      reasonKo = `중간 관절 굽힘각이 제한(${input.limits.midMinDeg}°~${input.limits.midMaxDeg}°)을 넘어 클램프했습니다.`;
    }
  }

  // 굽힘 평면: root→target 축과 pole(없으면 현재 mid)이 이루는 평면. 축 성분을 제거해 굽힘 방향을 얻는다.
  const bendCandidate = input.pole ? v3Sub(input.pole, root) : upper;
  let bendDir = v3Sub(bendCandidate, v3Scale(axis, v3Dot(bendCandidate, axis)));
  if (v3Length(bendDir) < LENGTH_EPSILON) {
    const fallback = v3Sub(upper, v3Scale(axis, v3Dot(upper, axis)));
    bendDir = v3Length(fallback) < LENGTH_EPSILON ? v3AnyPerpendicular(axis) : fallback;
  }
  bendDir = v3Normalize(bendDir);

  // 루트 각 α: cosα = (l1² + d² − l2²)/(2 l1 d)
  const rootCos = clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance), -1, 1);
  const rootSin = Math.sqrt(Math.max(0, 1 - rootCos * rootCos));
  const midPosition = v3Add(root, v3Add(v3Scale(axis, l1 * rootCos), v3Scale(bendDir, l1 * rootSin)));
  const endPosition = v3Add(root, v3Scale(axis, distance));

  // 굽힘 평면 법선: (root→end 축) × (상완 방향). newNormal = axis × bendDir와 같은 정의라 항등 케이스에서 부호가 맞는다.
  const oldNormal = v3Cross(v3Normalize(v3Sub(end, root)), v3Normalize(upper));
  const newNormal = v3Cross(axis, bendDir);
  const newUpper = v3Sub(midPosition, root);
  const rootRotation = rotationBetweenFrames(upper, oldNormal, newUpper, newNormal);
  const rotatedLower = qRotateVec3(rootRotation, lower);
  const rotatedNormal = qRotateVec3(rootRotation, oldNormal);
  const newLower = v3Sub(endPosition, midPosition);
  const midRotation = rotationBetweenFrames(rotatedLower, rotatedNormal, newLower, newNormal);

  const error = v3Distance(endPosition, target);
  const reached = status === "reached" && error <= IK_REACH_TOLERANCE;
  return {
    rootRotation,
    midRotation,
    reached,
    error,
    status: reached ? "reached" : status === "reached" ? "max-reach" : status,
    ...(reasonKo === undefined ? {} : { reasonKo }),
    midPosition,
    endPosition,
    midBendDeg: (bend * 180) / Math.PI,
  };
}
