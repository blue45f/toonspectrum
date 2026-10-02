/**
 * 포즈 프리셋 10종(SLOT_PRESET_IDS.pose 어휘와 1:1). 몸통·팔·다리 본만 담고 손가락은 손 포즈 슬롯에 맡긴다.
 * 각도는 일반 가동 범위 안의 자연스러운 값이며 JOINT_LIMITS_DEG 안이다(presets 테스트가 검증).
 * rest = T-pose, 정면 +Z, 왼쪽 +X(rotation-dsl 규약).
 */
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";

import {
  anklePitch,
  armAim,
  armTwist,
  elbowFlex,
  kneeFlex,
  lean,
  legAim,
  legTwist,
  seq,
  tiltTo,
  turnTo,
  wristDeviate,
  wristFlex,
  type Side,
} from "./rotation-dsl";

import type { PoseScope } from "../../contracts/bones";
import type { Pose, PosePreset } from "../../contracts/pose";
import type { PosePresetName } from "../../contracts/preset-vocabulary";

interface ArmSpec {
  readonly down?: number;
  readonly forward?: number;
  readonly twist?: number;
  readonly elbow?: number;
  readonly wristFlex?: number;
  readonly wristDeviate?: number;
}

interface LegSpec {
  readonly forward?: number;
  readonly out?: number;
  readonly twist?: number;
  readonly knee?: number;
  readonly ankle?: number;
}

interface BodySpec {
  readonly labelKo: string;
  readonly scope: PoseScope;
  readonly left?: ArmSpec;
  readonly right?: ArmSpec;
  readonly leftLeg?: LegSpec;
  readonly rightLeg?: LegSpec;
  readonly hipsLean?: number;
  readonly hipsTurn?: { readonly side: Side; readonly deg: number };
  readonly spineLean?: number;
  readonly spineTurn?: { readonly side: Side; readonly deg: number };
  readonly chestLean?: number;
  readonly neckLean?: number;
  readonly headLean?: number;
  readonly headTurn?: { readonly side: Side; readonly deg: number };
  readonly headTilt?: { readonly side: Side; readonly deg: number };
}

/** 양팔을 내린 기본 자세(idle 계열의 공통값) */
const ARM_IDLE: ArmSpec = { down: 76, forward: 3, elbow: 12 };

const SPECS: Readonly<Record<PosePresetName, BodySpec>> = {
  "a-pose": { labelKo: "A 포즈", scope: "full", left: { down: 45 }, right: { down: 45 } },
  "t-pose": { labelKo: "T 포즈", scope: "full" },
  idle: {
    labelKo: "서기",
    scope: "full",
    left: ARM_IDLE,
    right: ARM_IDLE,
    leftLeg: { out: 3 },
    rightLeg: { out: 3 },
    spineLean: 2,
    headLean: -2,
  },
  wave: {
    labelKo: "손 흔들기",
    scope: "upper",
    left: ARM_IDLE,
    right: { down: -12, forward: 12, twist: -72, elbow: 100, wristDeviate: 10 },
    headTilt: { side: "right", deg: 8 },
    spineTurn: { side: "right", deg: 4 },
  },
  point: {
    labelKo: "가리키기",
    scope: "upper",
    left: ARM_IDLE,
    right: { down: 6, forward: 84, elbow: 6, wristDeviate: 4 },
    headTurn: { side: "right", deg: 10 },
    spineTurn: { side: "right", deg: 6 },
  },
  "arms-crossed": {
    labelKo: "팔짱",
    scope: "upper",
    left: { down: 66, forward: 70, twist: 50, elbow: 110, wristFlex: 8 },
    right: { down: 62, forward: 68, twist: 52, elbow: 114, wristFlex: 10 },
    spineLean: -3,
    headTilt: { side: "left", deg: 4 },
  },
  "hands-on-hips": {
    labelKo: "허리에 손",
    scope: "upper",
    left: { down: 50, forward: -5, twist: 70, elbow: 80, wristFlex: 20 },
    right: { down: 50, forward: -5, twist: 70, elbow: 80, wristFlex: 20 },
    hipsLean: -3,
    chestLean: -2,
  },
  peace: {
    labelKo: "브이 포즈",
    scope: "upper",
    left: ARM_IDLE,
    right: { down: 26, forward: 34, twist: -62, elbow: 126, wristDeviate: -8 },
    headTilt: { side: "right", deg: 12 },
    headTurn: { side: "left", deg: 6 },
    spineTurn: { side: "right", deg: 3 },
  },
  sit: {
    labelKo: "앉기",
    scope: "full",
    left: { down: 70, forward: 26, twist: 10, elbow: 72 },
    right: { down: 70, forward: 26, twist: 10, elbow: 72 },
    leftLeg: { forward: 88, out: 6, knee: 92, ankle: -4 },
    rightLeg: { forward: 88, out: 6, knee: 92, ankle: -4 },
    spineLean: 6,
    neckLean: 2,
  },
  run: {
    labelKo: "달리기",
    scope: "full",
    left: { down: 68, forward: -42, twist: -20, elbow: 62 },
    right: { down: 64, forward: 46, twist: 12, elbow: 96 },
    leftLeg: { forward: 42, knee: 48, ankle: 10 },
    rightLeg: { forward: -22, knee: 88, ankle: 28 },
    hipsLean: 8,
    hipsTurn: { side: "left", deg: 6 },
    spineLean: 6,
    spineTurn: { side: "right", deg: 8 },
    headLean: -4,
  },
};

function arm(side: Side, spec: ArmSpec | undefined, into: Pose): void {
  if (!spec) return;
  // 비틀기는 본 자기 축 둘레이므로 맨 먼저(내재 회전) 적용하고, 방향(내림·앞으로)은 순수 swing으로 뒤에 합성한다.
  const upper = seq(armTwist(spec.twist ?? 0), armAim(side, spec.down ?? 0, spec.forward ?? 0));
  const lower = elbowFlex(side, spec.elbow ?? 0);
  const hand = seq(wristFlex(side, spec.wristFlex ?? 0), wristDeviate(side, spec.wristDeviate ?? 0));
  putIfRotated(into, `${side}UpperArm`, upper);
  putIfRotated(into, `${side}LowerArm`, lower);
  putIfRotated(into, `${side}Hand`, hand);
}

function leg(side: Side, spec: LegSpec | undefined, into: Pose): void {
  if (!spec) return;
  putIfRotated(into, `${side}UpperLeg`, seq(legTwist(side, spec.twist ?? 0), legAim(side, spec.forward ?? 0, spec.out ?? 0)));
  putIfRotated(into, `${side}LowerLeg`, kneeFlex(spec.knee ?? 0));
  putIfRotated(into, `${side}Foot`, anklePitch(spec.ankle ?? 0));
}

function putIfRotated(into: Pose, bone: keyof Pose, q: readonly [number, number, number, number]): void {
  if (Math.abs(q[0]) > 1e-12 || Math.abs(q[1]) > 1e-12 || Math.abs(q[2]) > 1e-12) into[bone] = q;
}

function buildPose(spec: BodySpec): Pose {
  const pose: Pose = {};
  putIfRotated(pose, "hips", seq(lean(spec.hipsLean ?? 0), spec.hipsTurn ? turnTo(spec.hipsTurn.side, spec.hipsTurn.deg) : lean(0)));
  putIfRotated(pose, "spine", seq(lean(spec.spineLean ?? 0), spec.spineTurn ? turnTo(spec.spineTurn.side, spec.spineTurn.deg) : lean(0)));
  putIfRotated(pose, "chest", lean(spec.chestLean ?? 0));
  putIfRotated(pose, "neck", lean(spec.neckLean ?? 0));
  putIfRotated(
    pose,
    "head",
    seq(
      lean(spec.headLean ?? 0),
      spec.headTurn ? turnTo(spec.headTurn.side, spec.headTurn.deg) : lean(0),
      spec.headTilt ? tiltTo(spec.headTilt.side, spec.headTilt.deg) : lean(0),
    ),
  );
  arm("left", spec.left, pose);
  arm("right", spec.right, pose);
  leg("left", spec.leftLeg, pose);
  leg("right", spec.rightLeg, pose);
  return pose;
}

/** 어휘 순서대로 10개 */
export const POSE_PRESETS: readonly PosePreset[] = SLOT_PRESET_IDS.pose.map((name) => {
  const spec = SPECS[name];
  return { id: `pose/${name}`, labelKo: spec.labelKo, pose: buildPose(spec), scope: spec.scope };
});

export function findPosePreset(name: PosePresetName): PosePreset {
  const found = POSE_PRESETS.find((preset) => preset.id === `pose/${name}`);
  if (!found) throw new Error(`포즈 프리셋이 없습니다: ${name}`);
  return found;
}
