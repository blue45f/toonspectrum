/**
 * 참조 rest 스켈레톤(55본, T-pose, 미터 단위, 신장 약 1.65 m).
 *
 * 절차적 휴머노이드(humanoid)와 제작 패키지(authored)가 실제 스켈레톤을 제공하지만,
 * animation 모듈의 단위 테스트·프리셋 관절 제한 검증·PosePanel의 기본 IK 환산에는
 * 소스에 독립적인 표준 비율이 필요하다. 규약은 `presets/rotation-dsl.ts`와 같다
 * (정면 +Z, 왼쪽 +X, rest 회전 항등, 손바닥 아래, 엄지 앞).
 */
import { HUMANOID_BONE_NAMES } from "../contracts/bones";
import { IDENTITY_QUAT } from "../contracts/pose";

import { sideSign, type Side } from "./presets/rotation-dsl";

import type { HumanoidBoneName } from "../contracts/bones";
import type { BoneData, SkeletonData } from "../contracts/mesh-data";
import type { Vec3 } from "../contracts/pose";

interface RestOffset {
  readonly parent: HumanoidBoneName | null;
  readonly translation: Vec3;
}

/** 왼쪽 기준 오프셋. 오른쪽은 X를 뒤집어 만든다. */
function sided(side: Side, x: number, y: number, z: number): Vec3 {
  return [sideSign(side) * x, y, z];
}

type RestOffsetTable = Partial<Record<HumanoidBoneName, RestOffset>>;

function limb(side: Side): RestOffsetTable {
  const p = (name: string): HumanoidBoneName => `${side}${name}` as HumanoidBoneName;
  return {
    [p("Shoulder")]: { parent: "upperChest", translation: sided(side, 0.05, 0.1, 0) },
    [p("UpperArm")]: { parent: p("Shoulder"), translation: sided(side, 0.1, 0, 0) },
    [p("LowerArm")]: { parent: p("UpperArm"), translation: sided(side, 0.27, 0, 0) },
    [p("Hand")]: { parent: p("LowerArm"), translation: sided(side, 0.25, 0, 0) },
    [p("ThumbMetacarpal")]: { parent: p("Hand"), translation: sided(side, 0.03, -0.01, 0.03) },
    [p("ThumbProximal")]: { parent: p("ThumbMetacarpal"), translation: sided(side, 0.03, 0, 0.025) },
    [p("ThumbDistal")]: { parent: p("ThumbProximal"), translation: sided(side, 0.025, 0, 0.02) },
    [p("IndexProximal")]: { parent: p("Hand"), translation: sided(side, 0.09, 0, 0.025) },
    [p("IndexIntermediate")]: { parent: p("IndexProximal"), translation: sided(side, 0.035, 0, 0) },
    [p("IndexDistal")]: { parent: p("IndexIntermediate"), translation: sided(side, 0.022, 0, 0) },
    [p("MiddleProximal")]: { parent: p("Hand"), translation: sided(side, 0.09, 0, 0.008) },
    [p("MiddleIntermediate")]: { parent: p("MiddleProximal"), translation: sided(side, 0.04, 0, 0) },
    [p("MiddleDistal")]: { parent: p("MiddleIntermediate"), translation: sided(side, 0.025, 0, 0) },
    [p("RingProximal")]: { parent: p("Hand"), translation: sided(side, 0.085, 0, -0.01) },
    [p("RingIntermediate")]: { parent: p("RingProximal"), translation: sided(side, 0.035, 0, 0) },
    [p("RingDistal")]: { parent: p("RingIntermediate"), translation: sided(side, 0.022, 0, 0) },
    [p("LittleProximal")]: { parent: p("Hand"), translation: sided(side, 0.075, 0, -0.028) },
    [p("LittleIntermediate")]: { parent: p("LittleProximal"), translation: sided(side, 0.03, 0, 0) },
    [p("LittleDistal")]: { parent: p("LittleIntermediate"), translation: sided(side, 0.02, 0, 0) },
    [p("UpperLeg")]: { parent: "hips", translation: sided(side, 0.09, -0.05, 0) },
    [p("LowerLeg")]: { parent: p("UpperLeg"), translation: [0, -0.42, 0] },
    [p("Foot")]: { parent: p("LowerLeg"), translation: [0, -0.4, 0] },
    [p("Toes")]: { parent: p("Foot"), translation: [0, -0.06, 0.13] },
  };
}

const AXIAL_OFFSETS: RestOffsetTable = {
  hips: { parent: null, translation: [0, 0.95, 0] },
  spine: { parent: "hips", translation: [0, 0.1, 0] },
  chest: { parent: "spine", translation: [0, 0.12, 0] },
  upperChest: { parent: "chest", translation: [0, 0.12, 0] },
  neck: { parent: "upperChest", translation: [0, 0.12, 0] },
  head: { parent: "neck", translation: [0, 0.08, 0] },
  leftEye: { parent: "head", translation: sided("left", 0.032, 0.08, 0.09) },
  rightEye: { parent: "head", translation: sided("right", 0.032, 0.08, 0.09) },
  jaw: { parent: "head", translation: [0, 0.01, 0.04] },
};

/** 축·좌·우 표를 합치고 55본이 모두 있는지 검사한다(빠지면 모듈 로드 시 throw — 계약 위반을 무음으로 넘기지 않음). */
function buildRestOffsets(): Readonly<Record<HumanoidBoneName, RestOffset>> {
  const table: RestOffsetTable = { ...AXIAL_OFFSETS, ...limb("left"), ...limb("right") };
  const missing = HUMANOID_BONE_NAMES.filter((name) => table[name] === undefined);
  if (missing.length > 0) throw new Error(`참조 스켈레톤에 rest 오프셋이 없는 본이 있습니다: ${missing.join(", ")}`);
  return table as Readonly<Record<HumanoidBoneName, RestOffset>>;
}

const REST_OFFSETS = buildRestOffsets();

/** 참조 스켈레톤의 본 순서는 HUMANOID_BONE_NAMES와 같다(부모가 항상 먼저 온다). */
export const REFERENCE_BONE_ORDER: readonly HumanoidBoneName[] = HUMANOID_BONE_NAMES;

/** 참조 rest 스켈레톤을 만든다(매 호출 새 객체, 값은 결정적). */
export function createReferenceSkeleton(): SkeletonData {
  const bones: BoneData[] = REFERENCE_BONE_ORDER.map((name) => {
    const offset = REST_OFFSETS[name];
    return { name, parent: offset.parent, restTranslation: offset.translation, restRotation: IDENTITY_QUAT };
  });
  return { bones };
}

/** 참조 스켈레톤에서 본의 rest 로컬 오프셋(부모 기준) */
export function referenceRestTranslation(name: HumanoidBoneName): Vec3 {
  return REST_OFFSETS[name].translation;
}
