/**
 * 포즈 저작용 회전 DSL과 리그 좌표 규약.
 *
 * 규약(VRM 1.0 정규화 리그와 동일):
 * - 우수 좌표계, Y-up, 캐릭터 정면 = +Z, 캐릭터의 왼쪽 = +X(`LEFT_X_SIGN`).
 * - rest 포즈 = T-pose(팔은 ±X로 수평, 손바닥은 아래(-Y), 엄지는 앞(+Z) 쪽).
 * - 모든 본의 rest 회전은 항등이며, `Pose`의 쿼터니언은 rest 기준 본 로컬 회전이다
 *   (`local = rest ∘ pose`, 부모의 회전을 상속한 프레임에서 적용).
 *
 * 아래 헬퍼는 "왼팔을 60° 내린다"처럼 해부학적 의미로 회전을 쓰게 해 좌우 부호 실수를 막는다.
 * 규약을 바꿔야 하면 `LEFT_X_SIGN` 하나만 바꾼다.
 */
import { degToRad, qFromAxisAngle, qMultiply, qNormalize, quatFromTo } from "../../shared/math";

import type { Quat, Vec3 } from "../../contracts/pose";

/** 캐릭터 왼쪽이 +X이면 1, -X이면 -1 */
export const LEFT_X_SIGN = 1 as const;

export type Side = "left" | "right";

/** 부호 리터럴을 뒤집는다(단항 음수는 number로 넓어지므로 분기로 쓴다). */
function flipSign(sign: 1 | -1): 1 | -1 {
  return sign === 1 ? -1 : 1;
}

/** 해당 측의 X 부호(왼쪽 = LEFT_X_SIGN, 오른쪽 = 반대) */
export function sideSign(side: Side): 1 | -1 {
  return side === "left" ? LEFT_X_SIGN : flipSign(LEFT_X_SIGN);
}

export function rotX(deg: number): Quat {
  return qFromAxisAngle([1, 0, 0], degToRad(deg));
}

export function rotY(deg: number): Quat {
  return qFromAxisAngle([0, 1, 0], degToRad(deg));
}

export function rotZ(deg: number): Quat {
  return qFromAxisAngle([0, 0, 1], degToRad(deg));
}

export function rotAxis(axis: Vec3, deg: number): Quat {
  return qFromAxisAngle(axis, degToRad(deg));
}

/** 회전을 나열한 순서대로(첫 번째부터) 적용하는 합성. seq(a, b) = b ∘ a */
export function seq(...rotations: readonly Quat[]): Quat {
  let result: Quat = [0, 0, 0, 1];
  for (const rotation of rotations) result = qMultiply(rotation, result);
  return qNormalize(result);
}

// ---------------------------------------------------------------- 팔

/** 단위 방향 restDir를 dir로 보내는 최소 회전(순수 swing, 비틀기 없음) */
export function aim(restDir: Vec3, dir: Vec3): Quat {
  return quatFromTo(restDir, dir);
}

/**
 * 상완 방향을 구면 각으로 지정한다. T-pose(수평, 측면 X) 기준
 * downDeg = 몸통 쪽으로 내린 각(음수면 올림), forwardDeg = 앞(+Z)으로 보낸 각(음수면 뒤).
 * 결과는 순수 swing이므로 swing-twist 분해의 twist는 0이다.
 */
export function armAim(side: Side, downDeg: number, forwardDeg: number): Quat {
  const sign = sideSign(side);
  const down = degToRad(downDeg);
  const forward = degToRad(forwardDeg);
  const lateral = Math.cos(down);
  const dir: Vec3 = [sign * lateral * Math.cos(forward), -Math.sin(down), lateral * Math.sin(forward)];
  return aim([sign, 0, 0], dir);
}

/**
 * 상완을 자기 축(어깨→팔꿈치, ±X) 둘레로 비튼다(내재 회전, seq의 첫 항목으로 쓴다).
 * 거울 대칭 포즈는 양쪽이 같은 X축 회전이어야 하므로(M·rotX(θ)·M⁻¹ = rotX(θ)) side 인자가 없다.
 * 양수 = 내회전(팔꿈치를 굽혔을 때 손이 몸 쪽으로 도는 방향), 음수 = 외회전(손이 위·바깥으로).
 */
export function armTwist(deg: number): Quat {
  return rotX(deg);
}

/** 팔꿈치 굴곡(본 로컬 Y 힌지). 손바닥 아래 T-pose에서 손이 앞(+Z)으로 온다. 0 = 곧게 폄. */
export function elbowFlex(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

/** 손목 굴곡(손바닥 쪽, 양수) */
export function wristFlex(side: Side, deg: number): Quat {
  return rotZ(-sideSign(side) * deg);
}

/** 손목을 엄지 쪽(요측, +Z)으로 꺾는다. */
export function wristDeviate(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

// ---------------------------------------------------------------- 손가락

/** 검지~소지 굴곡(손바닥 쪽). */
export function fingerCurl(side: Side, deg: number): Quat {
  return rotZ(-sideSign(side) * deg);
}

/** 검지~소지 벌림(엄지 쪽 +Z가 양수). */
export function fingerSpread(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

/** 엄지 굴곡: 엄지 방향(측면 X + 앞 Z 대각)과 손바닥 법선(-Y)에 수직인 축 둘레 회전. */
export function thumbCurl(side: Side, deg: number): Quat {
  const sign = sideSign(side);
  return rotAxis([Math.SQRT1_2, 0, -sign * Math.SQRT1_2], deg);
}

/** 엄지 벌림(손바닥 면 안에서 검지로부터 멀어짐). */
export function thumbSpread(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

// ---------------------------------------------------------------- 다리

/**
 * 대퇴 방향을 구면 각으로 지정한다. rest(−Y, 아래) 기준 forwardDeg = 앞(+Z)으로 든 각(음수면 뒤),
 * outDeg = 바깥쪽(측면)으로 벌린 각. 순수 swing.
 */
export function legAim(side: Side, forwardDeg: number, outDeg: number): Quat {
  const sign = sideSign(side);
  const forward = degToRad(forwardDeg);
  const out = degToRad(outDeg);
  const dir: Vec3 = [sign * Math.sin(out), -Math.cos(forward) * Math.cos(out), Math.sin(forward) * Math.cos(out)];
  return aim([0, -1, 0], dir);
}

/** 대퇴를 자기 축 둘레로 비튼다(내재 회전). 양수 = 무릎이 바깥을 향하는 외회전. */
export function legTwist(side: Side, deg: number): Quat {
  return rotY(-sideSign(side) * deg);
}

/** 무릎 굴곡(본 로컬 X 힌지, 발이 뒤로 간다). 0 = 곧게 폄. */
export function kneeFlex(deg: number): Quat {
  return rotX(deg);
}

/** 발목: 양수 = 발끝을 아래로(저측 굴곡). */
export function anklePitch(deg: number): Quat {
  return rotX(-deg);
}

// ---------------------------------------------------------------- 몸통·머리

/** 척추·목·머리를 앞으로 숙인다(양수). */
export function lean(deg: number): Quat {
  return rotX(deg);
}

/** 몸통·머리를 해당 측으로 돌린다(요). */
export function turnTo(side: Side, deg: number): Quat {
  return rotY(sideSign(side) * deg);
}

/** 몸통·머리를 해당 측 어깨 쪽으로 기울인다(롤). */
export function tiltTo(side: Side, deg: number): Quat {
  return rotZ(-sideSign(side) * deg);
}
