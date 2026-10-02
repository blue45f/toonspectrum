/**
 * 포즈 계약. 우수 좌표계, Y-up, 쿼터니언은 [x, y, z, w].
 * 포즈는 rest 기준 로컬 회전만 담는다(위치·스케일 없음).
 */
import type { HumanoidBoneName, IkChainId, PoseScope } from "./bones";
import type { PresetId } from "./slots";

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** [x, y, z, w] */
export type Quat = readonly [number, number, number, number];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];
export const ZERO_VEC3: Vec3 = [0, 0, 0];

/** 본별 로컬 회전(rest 기준). 없는 본은 rest 그대로. */
export type Pose = Partial<Record<HumanoidBoneName, Quat>>;

export interface IkGoal {
  readonly chain: IkChainId;
  /** 모델 공간(월드) 좌표 */
  readonly target: Vec3;
  /** 중간 관절이 향할 폴 벡터 위치(선택) */
  readonly pole?: Vec3;
}

export interface PosePreset {
  readonly id: PresetId;
  readonly labelKo: string;
  readonly pose: Pose;
  readonly scope: PoseScope;
}

/** 손 포즈 프리셋: 손가락 30본만 담는다(FINGER_BONE_NAMES). */
export interface HandPosePreset {
  readonly id: PresetId;
  readonly labelKo: string;
  readonly left: Pose;
  readonly right: Pose;
}

export interface HandPosePair {
  readonly left: Pose;
  readonly right: Pose;
}

/** 쿼터니언이 유한하고 길이가 1±eps인지 */
export function isUnitQuat(q: Quat, eps = 1e-4): boolean {
  const [x, y, z, w] = q;
  if (![x, y, z, w].every(Number.isFinite)) return false;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  return Math.abs(len - 1) <= eps;
}
