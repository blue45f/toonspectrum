/**
 * MediaPipe Pose Landmarker 33점 → 휴머노이드 본 로컬 회전(순수).
 *
 * 방법: 각 본의 랜드마크 세그먼트(어깨→팔꿈치 등) 방향을 모델 공간에서 구하고, T-pose rest 방향에서 그 방향으로 가는
 * 최소 회전(swing)을 월드 회전으로 삼는다. 부모의 월드 회전을 역으로 곱해 로컬 회전을 만들고, rest 축 둘레의
 * swing-twist 분해로 twist(방향만으로는 알 수 없는 비틀기)를 버린 뒤 `JOINT_LIMITS_DEG`의 swing 한계로 클램프한다.
 * 엉덩이·머리는 세 점으로 좌표 프레임을 세워 3자유도 회전을 만든다(엉덩이는 full 스코프에서만).
 * 머리: 중립 자세에서도 귀 중점→코 선은 약간 아래를 향하므로 `HEAD_FORWARD_REST_PITCH_DEG`만큼 되돌려 중립 = 항등이 되게 한다(근사).
 *
 * 규약(animation/presets/rotation-dsl.ts와 동일): 정면 +Z, 왼쪽 +X, rest 회전 항등, 팔은 ±X, 다리는 -Y.
 * 가시성이 `visibilityMin` 미만인 랜드마크가 끼는 본은 적용하지 않고 사유를 남긴다(무음 대체 금지).
 * 스코프 밖 본은 결과 pose에 넣지 않는다(reducer가 스코프 안 본만 교체한다).
 */
import { HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS, JOINT_LIMITS_DEG, LANDMARK_VISIBILITY_MIN, bonesInScope } from "../../contracts";
import { QUAT_IDENTITY, degToRad, qClampAngle, qFromAxisAngle, qInverse, qMultiply, qNormalize, quatFromTo, swingTwist, v3Cross, v3Dot, v3Normalize, v3Scale, v3Sub } from "../../shared/math";

import { landmarkIndexOf, midpoint, preparePoseLandmarks, segmentDirection } from "./landmark-space";

import type { LandmarkSpaceOptions } from "./landmark-space";
import type { HumanoidBoneName, LandmarkApplyScope, Pose, PoseLandmark, PoseLandmarkName } from "../../contracts";
import type { Quat, Vec3 } from "../../shared/math";

export interface LandmarksToPoseOptions extends LandmarkSpaceOptions {
  readonly scope: LandmarkApplyScope;
  /** 기본 LANDMARK_VISIBILITY_MIN(0.5) */
  readonly visibilityMin?: number;
  /** 기본 true: JOINT_LIMITS_DEG로 swing·twist 클램프 */
  readonly clampToJointLimits?: boolean;
}

export interface SkippedBone {
  readonly bone: HumanoidBoneName;
  readonly reasonKo: string;
}

export interface LandmarksToPoseResult {
  readonly pose: Pose;
  readonly scope: LandmarkApplyScope;
  readonly appliedBones: readonly HumanoidBoneName[];
  readonly skippedBones: readonly SkippedBone[];
  /** 관절 한계로 잘린 본 */
  readonly clampedBones: readonly HumanoidBoneName[];
  readonly mirrored: boolean;
}

type PointRef = PoseLandmarkName | { readonly mid: readonly [PoseLandmarkName, PoseLandmarkName] };

interface SegmentSpec {
  readonly from: PointRef;
  readonly to: PointRef;
  /** T-pose rest 방향(단위) */
  readonly rest: Vec3;
}

const FOOT_REST: Vec3 = v3Normalize([0, -0.06, 0.13]);

/** 중립 머리에서 귀 중점→코(끝) 선이 수평 아래로 기운 각(도). MediaPipe 귀(이주)·코끝 랜드마크 기준 근사값. */
export const HEAD_FORWARD_REST_PITCH_DEG = 6;

/** 본 → 랜드마크 세그먼트. 어깨·척추·목은 방향 정보가 없어 항등(부모 프레임 상속). */
export const POSE_SEGMENTS: Readonly<Partial<Record<HumanoidBoneName, SegmentSpec>>> = {
  leftUpperArm: { from: "left_shoulder", to: "left_elbow", rest: [1, 0, 0] },
  leftLowerArm: { from: "left_elbow", to: "left_wrist", rest: [1, 0, 0] },
  leftHand: { from: "left_wrist", to: { mid: ["left_index", "left_pinky"] }, rest: [1, 0, 0] },
  rightUpperArm: { from: "right_shoulder", to: "right_elbow", rest: [-1, 0, 0] },
  rightLowerArm: { from: "right_elbow", to: "right_wrist", rest: [-1, 0, 0] },
  rightHand: { from: "right_wrist", to: { mid: ["right_index", "right_pinky"] }, rest: [-1, 0, 0] },
  leftUpperLeg: { from: "left_hip", to: "left_knee", rest: [0, -1, 0] },
  leftLowerLeg: { from: "left_knee", to: "left_ankle", rest: [0, -1, 0] },
  leftFoot: { from: "left_ankle", to: "left_foot_index", rest: FOOT_REST },
  rightUpperLeg: { from: "right_hip", to: "right_knee", rest: [0, -1, 0] },
  rightLowerLeg: { from: "right_knee", to: "right_ankle", rest: [0, -1, 0] },
  rightFoot: { from: "right_ankle", to: "right_foot_index", rest: FOOT_REST },
};

/** 프레임(3점)으로 회전을 구하는 본과 필요한 랜드마크 */
const FRAME_LANDMARKS: Readonly<Record<"hips" | "head", readonly PoseLandmarkName[]>> = {
  hips: ["left_hip", "right_hip", "left_shoulder", "right_shoulder"],
  head: ["left_ear", "right_ear", "nose"],
};

/** 정규직교 기저(열벡터 x, y, z) → 쿼터니언 [x, y, z, w] */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00 = x[0];
  const m10 = x[1];
  const m20 = x[2];
  const m01 = y[0];
  const m11 = y[1];
  const m21 = y[2];
  const m02 = z[0];
  const m12 = z[1];
  const m22 = z[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return qNormalize([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return qNormalize([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return qNormalize([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]);
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return qNormalize([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
}

type BoneOutcome = { readonly kind: "applied"; readonly local: Quat; readonly clamped: boolean } | { readonly kind: "skipped"; readonly reasonKo: string };

function labelOf(ref: PointRef): string {
  return typeof ref === "string" ? ref : `${ref.mid[0]}·${ref.mid[1]} 중점`;
}

/** 랜드마크(세그먼트) 방향 기반 swing 회전 */
export function landmarksToPose(landmarks: readonly PoseLandmark[], options: LandmarksToPoseOptions): LandmarksToPoseResult {
  const prepared = preparePoseLandmarks(landmarks, options);
  const visibilityMin = options.visibilityMin ?? LANDMARK_VISIBILITY_MIN;
  const clamp = options.clampToJointLimits ?? true;
  const scopeBones = new Set<HumanoidBoneName>(bonesInScope(options.scope));

  const point = (ref: PointRef): Vec3 => {
    if (typeof ref === "string") return prepared.points[landmarkIndexOf(ref)] ?? [0, 0, 0];
    return midpoint(point(ref.mid[0]), point(ref.mid[1]));
  };
  const visible = (ref: PointRef): boolean => {
    const names = typeof ref === "string" ? [ref] : ref.mid;
    return names.every((name) => (prepared.visibility[landmarkIndexOf(name)] ?? 0) >= visibilityMin);
  };
  const invisibleNames = (refs: readonly PointRef[]): string[] =>
    refs.flatMap((ref) => (typeof ref === "string" ? [ref] : [...ref.mid])).filter((name) => (prepared.visibility[landmarkIndexOf(name)] ?? 0) < visibilityMin);

  const world = new Map<HumanoidBoneName, Quat>();
  const pose: Partial<Record<HumanoidBoneName, Quat>> = {};
  const applied: HumanoidBoneName[] = [];
  const skipped: SkippedBone[] = [];
  const clampedBones: HumanoidBoneName[] = [];

  const finishLocal = (bone: HumanoidBoneName, parentWorld: Quat, worldTarget: Quat, restAxis: Vec3, keepTwist: boolean): { local: Quat; clamped: boolean } => {
    const rawLocal = qNormalize(qMultiply(qInverse(parentWorld), worldTarget));
    const { swing, twist } = swingTwist(rawLocal, restAxis);
    const limits = JOINT_LIMITS_DEG[bone];
    let clamped = false;
    let swingOut = swing;
    let twistOut: Quat = keepTwist ? twist : QUAT_IDENTITY;
    if (clamp) {
      const clampedSwing = qClampAngle(swing, degToRad(limits.swing));
      if (clampedSwing !== swing && Math.abs(qMultiply(clampedSwing, qInverse(swing))[3]) < 1 - 1e-9) clamped = true;
      swingOut = clampedSwing;
      if (keepTwist) {
        const clampedTwist = qClampAngle(twist, degToRad(limits.twist));
        if (Math.abs(qMultiply(clampedTwist, qInverse(twist))[3]) < 1 - 1e-9) clamped = true;
        twistOut = clampedTwist;
      }
    }
    return { local: qNormalize(qMultiply(swingOut, twistOut)), clamped };
  };

  const frameOutcome = (bone: "hips" | "head", parentWorld: Quat): BoneOutcome => {
    const names = FRAME_LANDMARKS[bone];
    const missing = invisibleNames(names);
    if (missing.length > 0) return { kind: "skipped", reasonKo: `가시성 ${visibilityMin} 미만 랜드마크: ${missing.join(", ")}` };
    let x: Vec3;
    let up: Vec3;
    if (bone === "hips") {
      x = v3Normalize(v3Sub(point("left_hip"), point("right_hip")));
      up = v3Normalize(v3Sub(midpoint(point("left_shoulder"), point("right_shoulder")), midpoint(point("left_hip"), point("right_hip"))));
    } else {
      x = v3Normalize(v3Sub(point("left_ear"), point("right_ear")));
      const forward = v3Sub(point("nose"), midpoint(point("left_ear"), point("right_ear")));
      const z = v3Normalize(v3Sub(forward, v3Scale(x, v3Dot(forward, x))));
      if (z[0] === 0 && z[1] === 0 && z[2] === 0) return { kind: "skipped", reasonKo: "코와 귀 중점이 겹쳐 머리 방향을 정할 수 없습니다." };
      const y = v3Normalize(v3Cross(z, x));
      // 프레임의 +Z(귀→코)는 중립에서 rotX(+restPitch)만큼 아래를 향하므로 rotX(-restPitch)를 곱해 되돌린다.
      const restCorrection = qFromAxisAngle([1, 0, 0], degToRad(-HEAD_FORWARD_REST_PITCH_DEG));
      const target = qNormalize(qMultiply(quatFromBasis(x, y, z), restCorrection));
      const { local, clamped } = finishLocal(bone, parentWorld, target, [0, 1, 0], true);
      return { kind: "applied", local, clamped };
    }
    if ((x[0] === 0 && x[1] === 0 && x[2] === 0) || (up[0] === 0 && up[1] === 0 && up[2] === 0)) {
      return { kind: "skipped", reasonKo: "엉덩이·어깨 랜드마크가 겹쳐 몸통 프레임을 정할 수 없습니다." };
    }
    const z = v3Normalize(v3Cross(x, up));
    if (z[0] === 0 && z[1] === 0 && z[2] === 0) return { kind: "skipped", reasonKo: "엉덩이 선과 몸통 축이 평행해 프레임을 정할 수 없습니다." };
    const y = v3Normalize(v3Cross(z, x));
    const target = quatFromBasis(x, y, z);
    const { local, clamped } = finishLocal(bone, parentWorld, target, [0, 1, 0], true);
    return { kind: "applied", local, clamped };
  };

  const segmentOutcome = (bone: HumanoidBoneName, spec: SegmentSpec, parentWorld: Quat): BoneOutcome => {
    if (!visible(spec.from) || !visible(spec.to)) {
      return { kind: "skipped", reasonKo: `가시성 ${visibilityMin} 미만 랜드마크: ${invisibleNames([spec.from, spec.to]).join(", ")}` };
    }
    const direction = segmentDirection(point(spec.from), point(spec.to));
    if (!direction) return { kind: "skipped", reasonKo: `${labelOf(spec.from)}→${labelOf(spec.to)} 랜드마크가 겹쳐 방향을 정할 수 없습니다.` };
    const target = quatFromTo(spec.rest, direction);
    const { local, clamped } = finishLocal(bone, parentWorld, target, spec.rest, false);
    return { kind: "applied", local, clamped };
  };

  for (const bone of HUMANOID_BONE_NAMES) {
    const parent = HUMANOID_BONE_PARENTS[bone];
    const parentWorld = parent ? (world.get(parent) ?? QUAT_IDENTITY) : QUAT_IDENTITY;
    let local: Quat = QUAT_IDENTITY;
    if (scopeBones.has(bone)) {
      let outcome: BoneOutcome | null = null;
      if (bone === "hips" || bone === "head") outcome = frameOutcome(bone, parentWorld);
      else {
        const spec = POSE_SEGMENTS[bone];
        if (spec) outcome = segmentOutcome(bone, spec, parentWorld);
      }
      if (outcome?.kind === "applied") {
        local = outcome.local;
        pose[bone] = local;
        applied.push(bone);
        if (outcome.clamped) clampedBones.push(bone);
      } else if (outcome?.kind === "skipped") {
        skipped.push({ bone, reasonKo: outcome.reasonKo });
      }
    }
    world.set(bone, qNormalize(qMultiply(parentWorld, local)));
  }

  return { pose, scope: options.scope, appliedBones: applied, skippedBones: skipped, clampedBones, mirrored: prepared.mirrored };
}

/** 스코프에서 랜드마크로 제어 가능한 본 목록(세그먼트·프레임이 정의된 것만) */
export function controllableBones(scope: LandmarkApplyScope): readonly HumanoidBoneName[] {
  const inScope = new Set<HumanoidBoneName>(bonesInScope(scope));
  return HUMANOID_BONE_NAMES.filter((bone) => inScope.has(bone) && (bone === "hips" || bone === "head" || POSE_SEGMENTS[bone] !== undefined));
}
