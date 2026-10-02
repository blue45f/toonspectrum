/**
 * 체형 morph 관절 오프셋을 리그의 본에 반영한다(humanoid 요청 §4.1). 플랜의 체형 morph 가중치 w마다 본의 로컬 rest 평행이동에 w × 오프셋을 더하고
 * **역바인드(절대 바인드 행렬의 역)를 morph된 rest에서 다시 만든다.** 정점은 같은 w로 morph되어 새 관절 위치에 있는데 본이 옛 위치 그대로면
 * 팔꿈치·무릎이 옛 위치를 중심으로 회전해 팔·다리가 찢어진다.
 *
 * Babylon 대응: 본은 TransformNode에 링크돼 있어 매 프레임 로컬 변환을 노드에서 읽는다 → 노드 `position`을 새 rest 평행이동으로 바꾸고,
 * `bone.updateMatrix(bind, true, false)`가 바인드 행렬과 하위 본까지의 절대 바인드/역바인드 행렬을 다시 계산한다(`setRestMatrix`도 맞춘다).
 * 보조 본(헤어·스커트 체인)은 휴머노이드 본의 자식이라 부모 이동이 계층으로 따라오고 정점은 소스가 같은 이동량의 morph를 붙여 둔다.
 *
 * 합산 식은 humanoid `skeletonWithJointOffsets`와 같다(`render/joint-offsets.ts`). 변경이 없는 본은 건드리지 않는다(슬라이더 드래그 비용 최소화).
 */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { sameOffset, sumJointOffsets } from "../joint-offsets";

import { toQuaternion } from "./convert";

import type { RigBone } from "./character-rig";
import type { MorphJointOffsets, Vec3 } from "../../contracts";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";

export interface JointOffsetRig {
  readonly table: MorphJointOffsets;
  /** 가중치로 본을 옮긴다. 바뀐 본 수를 돌려준다. */
  apply(weights: Readonly<Record<string, number>>): number;
  /** 본의 지금 로컬 rest 평행이동(morph 반영). 모르는 본이면 null. */
  effectiveRestTranslation(boneName: string): Vec3 | null;
  /** 현재 적용된 본별 오프셋 합(진단·복원용 복사본) */
  snapshot(): ReadonlyMap<string, Vec3>;
  /** 스냅샷 상태로 되돌린다(썸네일 일시 적용 복원). */
  restore(snapshot: ReadonlyMap<string, Vec3>): void;
}

export interface JointOffsetDeps {
  readonly table: MorphJointOffsets;
  readonly bones: ReadonlyMap<string, RigBone>;
  readonly skeleton: Skeleton | null;
  /** 이 이름의 morph가 리그에 있는지(없으면 정점이 안 움직이므로 본도 움직이지 않는다) */
  readonly morphAvailable: (morphName: string) => boolean;
}

/** 오프셋 표가 비어 있으면(오프셋이 있는 morph가 없으면) null — 소비할 것이 없다. */
export function createJointOffsetRig(deps: JointOffsetDeps): JointOffsetRig | null {
  const entries = Object.values(deps.table).filter((perBone) => perBone !== undefined && Object.keys(perBone).length > 0);
  if (entries.length === 0) return null;
  const current = new Map<string, Vec3>();

  const translationOf = (rb: RigBone, delta: Vec3 | undefined): Vec3 => {
    const base = rb.restTranslation;
    return delta ? [base[0] + delta[0], base[1] + delta[1], base[2] + delta[2]] : base;
  };

  const place = (rb: RigBone, translation: Vec3): void => {
    rb.node.position.set(translation[0], translation[1], translation[2]);
    const bind = Matrix.Compose(Vector3.One(), toQuaternion(rb.restLocal), new Vector3(translation[0], translation[1], translation[2]));
    // 바인드 행렬과 절대 바인드·역바인드(하위 본 포함)를 morph된 rest에서 다시 만든다. 로컬 행렬은 링크된 노드가 매 프레임 덮어쓴다.
    rb.bone.updateMatrix(bind, true, false);
    rb.bone.setRestMatrix(bind);
  };

  const applySums = (sums: ReadonlyMap<string, Vec3>): number => {
    const changed = new Set<string>();
    for (const [name, delta] of sums) if (!sameOffset(current.get(name), delta)) changed.add(name);
    for (const name of current.keys()) if (!sums.has(name) && !sameOffset(current.get(name), undefined)) changed.add(name);
    if (changed.size === 0) return 0;
    // 부모가 자식보다 먼저 오도록 스켈레톤 순서(위상 순서)로 처리한다.
    const order = deps.skeleton ? deps.skeleton.bones.map((bone) => bone.name) : [...changed];
    let count = 0;
    for (const name of order) {
      if (!changed.has(name)) continue;
      const rb = deps.bones.get(name);
      if (!rb) continue;
      const delta = sums.get(name);
      place(rb, translationOf(rb, delta));
      if (delta) current.set(name, delta);
      else current.delete(name);
      count += 1;
    }
    return count;
  };

  return {
    table: deps.table,
    apply: (weights) => applySums(sumJointOffsets(deps.table, weights, deps.morphAvailable)),
    effectiveRestTranslation(boneName) {
      const rb = deps.bones.get(boneName);
      return rb ? translationOf(rb, current.get(boneName)) : null;
    },
    snapshot: () => new Map(current),
    restore: (snapshot) => {
      applySums(snapshot);
    },
  };
}
