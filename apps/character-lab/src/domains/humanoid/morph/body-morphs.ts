/**
 * 체형 파라미터 9종 ± morph. 각 파라미터를 ±1로 둔 케이지를 다시 생성해 기준 케이지와의 차를 Catmull-Clark
 * 스텐실로 리프트한다(CC는 선형 연산자이므로 lift(Δcage) = lift(cage±) − lift(cage0)가 정확히 성립).
 * 머리 케이지 델타도 같은 방식이며, 머리에 붙은 작은 파츠는 머리 프레임 유사 변환(headFrameDelta)으로 같은 변위를 받는다.
 * 관절 오프셋(jointOffsets)은 ±1 스켈레톤의 rest 평행이동 차다.
 * 원리: SMPL "형상 델타 후 관절 회귀"(개념만).
 */
import { BODY_PARAM_KEYS, HUMANOID_BONE_NAMES, paramMorphName, type BodyParamKey, type HumanoidBoneName, type MorphTargetName, type ParamValues } from "../../../contracts";
import { buildBodyCage, type BodyCage } from "../geometry/cage";
import { buildHeadCage, type HeadCage } from "../geometry/head-cage";
import { liftAttribute, type SubdivisionPlan } from "../geometry/subdivision";
import { headFrameDelta, resolveProportions, type HeadFrame } from "../proportions";
import { buildHumanoidSkeleton } from "../skeleton/skeleton-builder";

import { subtractArrays } from "./morph-utils";

import type { Vec3 } from "../../../shared/math";

export type JointOffsets = Partial<Record<HumanoidBoneName, Vec3>>;

export interface BodyMorphTarget {
  readonly key: BodyParamKey;
  readonly sign: "+" | "-";
  readonly name: MorphTargetName;
  /** 몸 케이지 용접 정점 델타(세분 후) */
  readonly bodyDelta: Float32Array;
  /** 머리 케이지 용접 정점 델타(세분 후) */
  readonly headDelta: Float32Array;
  /** 이 파라미터 ±1에서의 머리 프레임 */
  readonly headFrame: HeadFrame;
}

export interface BodyMorphSet {
  readonly targets: readonly BodyMorphTarget[];
  /** 파라미터별 ± 관절 오프셋(부모 기준 rest 평행이동 차) */
  readonly jointOffsets: Readonly<Record<BodyParamKey, { readonly plus: JointOffsets; readonly minus: JointOffsets }>>;
}

export interface BodyMorphInputs {
  readonly baseParams: ParamValues<BodyParamKey>;
  readonly bodyCage: BodyCage;
  readonly headCage: HeadCage;
  readonly bodyPlan: SubdivisionPlan;
  readonly headPlan: SubdivisionPlan;
}

function jointOffsets(base: ParamValues<BodyParamKey>, variant: ParamValues<BodyParamKey>): JointOffsets {
  // 스켈레톤은 비례만 필요하므로 케이지를 다시 만들지 않는다(조립기 1회당 케이지 36회 절감).
  const a = buildHumanoidSkeleton(resolveProportions(base));
  const b = buildHumanoidSkeleton(resolveProportions(variant));
  const out: JointOffsets = {};
  HUMANOID_BONE_NAMES.forEach((name, i) => {
    const ta = a.bones[i].restTranslation;
    const tb = b.bones[i].restTranslation;
    const d: Vec3 = [tb[0] - ta[0], tb[1] - ta[1], tb[2] - ta[2]];
    if (Math.abs(d[0]) > 1e-9 || Math.abs(d[1]) > 1e-9 || Math.abs(d[2]) > 1e-9) out[name] = d;
  });
  return out;
}

/** 스펙 공개 API: 체형 9 파라미터 × ± = 18 morph(용접 정점 델타) + 관절 오프셋 */
export function buildBodyMorphs(inputs: BodyMorphInputs): BodyMorphSet {
  const { baseParams, bodyCage, headCage, bodyPlan, headPlan } = inputs;
  const baseBody = liftAttribute(bodyPlan, bodyCage.mesh.positions, 3);
  const baseHead = liftAttribute(headPlan, headCage.mesh.positions, 3);
  const targets: BodyMorphTarget[] = [];
  const offsets: Partial<Record<BodyParamKey, { plus: JointOffsets; minus: JointOffsets }>> = {};
  for (const key of BODY_PARAM_KEYS) {
    const variants: Array<["+" | "-", number]> = [
      ["+", 1],
      ["-", -1],
    ];
    const pair: { plus: JointOffsets; minus: JointOffsets } = { plus: {}, minus: {} };
    for (const [sign, value] of variants) {
      const params: ParamValues<BodyParamKey> = { ...baseParams, [key]: value };
      const body = buildBodyCage(params);
      const head = buildHeadCage(params);
      const bodyDelta = subtractArrays(liftAttribute(bodyPlan, body.mesh.positions, 3), baseBody);
      const headDelta = subtractArrays(liftAttribute(headPlan, head.mesh.positions, 3), baseHead);
      targets.push({ key, sign, name: paramMorphName(key, sign), bodyDelta, headDelta, headFrame: head.frame });
      if (sign === "+") pair.plus = jointOffsets(baseParams, params);
      else pair.minus = jointOffsets(baseParams, params);
    }
    offsets[key] = pair;
  }
  return { targets, jointOffsets: offsets as Record<BodyParamKey, { plus: JointOffsets; minus: JointOffsets }> };
}

/** 머리에 붙은 파츠(모델 공간 정점)의 체형 morph 델타: 머리 프레임 유사 변환 */
export function headAttachedBodyDelta(positions: Float32Array, from: HeadFrame, to: HeadFrame): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const d = headFrameDelta(from, to, [positions[i], positions[i + 1], positions[i + 2]]);
    out[i] = d[0];
    out[i + 1] = d[1];
    out[i + 2] = d[2];
  }
  return out;
}
