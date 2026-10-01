/**
 * 포즈 프레임 스켈레톤(순수). 뷰포트 관절 드래그(`animation/joint-drag`)와 IK 환산이 쓰는 `SkeletonData`를 엔진 리그에서
 * 만든다. 본 이름은 휴머노이드 이름으로 바꾸고(패키지의 Mixamo 이름 → `leftUpperArm`) 보조 본은 원래 이름을 유지한다.
 *
 * 포즈 규약(character-rig.ts와 같다):
 * - `bone-local`(절차 소스): 본 로컬 회전 = rest ∘ pose → 스켈레톤을 그대로 쓴다(rest 회전·평행이동 그대로).
 * - `model-space`(제작 패키지): 포즈는 rest 회전이 항등인 참조 스켈레톤의 모델 공간 델타다 → rest 회전을 항등으로 두고
 *   평행이동만 "rest 월드 위치 차이"로 바꾼다. 이러면 FK 월드 회전 = 포즈 = 리그의 `pose ∘ rest 월드`와 같은 회전 델타이고
 *   자식 위치도 같은 피벗 둘레로 돈다(리그 로컬 식 `Rp⁻¹ ∘ pose ∘ Rp ∘ restLocal`의 귀납 결과).
 */
import { qNormalize, qRotateVec3, v3Add, v3Sub } from "../shared/math";

import type { BoneData, Quat, SkeletonData, Vec3 } from "../contracts";

/** 포즈 규약(`bone-local` | `model-space`), character-rig.ts가 같은 이름으로 재export한다. */
export type PoseConvention = "bone-local" | "model-space";

/** 리그 본의 rest 스냅샷(Babylon 객체 없음) */
export interface RigBoneSnapshot {
  /** 소스 이름(절차: 휴머노이드/보조 이름, 패키지: 노드 이름) */
  readonly name: string;
  /** 매핑된 휴머노이드 이름(없으면 null = 보조 본) */
  readonly humanoid: string | null;
  readonly parentName: string | null;
  /** 부모 기준 rest 평행이동 */
  readonly restTranslation: Vec3;
  /** 부모 기준 rest 로컬 회전 */
  readonly restLocal: Quat;
  /** 절대(모델 공간) rest 회전 */
  readonly restWorld: Quat;
  readonly auxiliary: boolean;
}

const IDENTITY: Quat = [0, 0, 0, 1];

/** 스냅샷 이름을 스켈레톤 이름으로(휴머노이드 매핑 우선) */
function skeletonName(snapshot: RigBoneSnapshot): string {
  return snapshot.humanoid ?? snapshot.name;
}

/**
 * 스냅샷 목록 → 포즈 프레임 `SkeletonData`. 부모가 목록에 없으면 루트로 취급한다.
 * 같은 스켈레톤 이름이 둘 이상이면(휴머노이드 매핑 충돌) 먼저 나온 본만 남긴다.
 */
export function buildPoseFrameSkeleton(snapshots: readonly RigBoneSnapshot[], convention: PoseConvention): SkeletonData {
  const bySource = new Map<string, RigBoneSnapshot>();
  for (const snapshot of snapshots) bySource.set(snapshot.name, snapshot);

  // rest 월드 위치(model-space에서만 필요): 부모 월드 위치 + 부모 월드 회전으로 돌린 restTranslation
  const worldPositions = new Map<string, Vec3>();
  const visiting = new Set<string>();
  const worldPosition = (snapshot: RigBoneSnapshot): Vec3 => {
    const cached = worldPositions.get(snapshot.name);
    if (cached) return cached;
    if (visiting.has(snapshot.name)) throw new Error(`리그 본 부모 관계에 순환이 있습니다: ${snapshot.name}`);
    visiting.add(snapshot.name);
    const parent = snapshot.parentName === null ? undefined : bySource.get(snapshot.parentName);
    const position: Vec3 = parent ? v3Add(worldPosition(parent), qRotateVec3(parent.restWorld, snapshot.restTranslation)) : snapshot.restTranslation;
    visiting.delete(snapshot.name);
    worldPositions.set(snapshot.name, position);
    return position;
  };

  const seen = new Set<string>();
  const bones: BoneData[] = [];
  for (const snapshot of snapshots) {
    const name = skeletonName(snapshot);
    if (seen.has(name)) continue;
    seen.add(name);
    const parent = snapshot.parentName === null ? undefined : bySource.get(snapshot.parentName);
    const parentName = parent ? skeletonName(parent) : null;
    if (convention === "bone-local") {
      bones.push({ name, parent: parentName, restTranslation: snapshot.restTranslation, restRotation: qNormalize(snapshot.restLocal), ...(snapshot.auxiliary ? { auxiliary: true } : {}) });
    } else {
      const translation = parent ? v3Sub(worldPosition(snapshot), worldPosition(parent)) : worldPosition(snapshot);
      bones.push({ name, parent: parentName, restTranslation: translation, restRotation: IDENTITY, ...(snapshot.auxiliary ? { auxiliary: true } : {}) });
    }
  }
  return { bones };
}

/** 엔진이 선택적으로 제공하는 스켈레톤 포트(계약 CharacterEngine 밖, 구조적 판별) */
export interface PoseSkeletonSource {
  /** 현재 소스의 포즈 프레임 스켈레톤. 스켈레톤이 없으면 null. */
  poseSkeleton(): SkeletonData | null;
}

export function hasPoseSkeleton(value: unknown): value is PoseSkeletonSource {
  return typeof value === "object" && value !== null && typeof (value as { poseSkeleton?: unknown }).poseSkeleton === "function";
}

/** 엔진에서 스켈레톤을 읽는다. 포트가 없거나 스켈레톤이 없으면 null(패널은 드래그를 비활성화하고 사유를 보인다). */
export function readPoseSkeleton(engine: unknown): SkeletonData | null {
  if (!hasPoseSkeleton(engine)) return null;
  return engine.poseSkeleton();
}
