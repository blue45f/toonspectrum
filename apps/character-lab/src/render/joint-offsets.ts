/**
 * 체형 morph 관절 오프셋 합산(순수). `HumanoidModelData.jointOffsets`는 체형 morph 이름(`param:<키>:+|-`) → 본 → rest 평행이동 오프셋이고,
 * 가중치 w인 morph는 본마다 w × 오프셋을 **로컬 rest 평행이동**에 더한다. 정점은 같은 w로 morph되므로 본도 같이 움직여야
 * 팔·다리가 새 관절 위치를 중심으로 회전한다(안 그러면 팔꿈치·무릎이 옛 위치 기준으로 회전 — humanoid 요청 §4.1).
 *
 * 기준 구현은 humanoid `skeletonWithJointOffsets`(+`boneWorldMatrices`)이며 이 함수는 같은 합산 식이다(영역 간 import 금지라 재구현;
 * `app/render-humanoid-link.integration.test.ts`가 실제 humanoid 모델과 결과 일치를 확인한다).
 */
import type { MorphJointOffsets, Vec3 } from "../contracts";

/** 본 이름 → 로컬 rest 평행이동에 더할 합(오프셋이 0인 본은 항목이 없다) */
export type JointOffsetSums = ReadonlyMap<string, Vec3>;

/**
 * 가중치 맵에서 본별 오프셋 합을 구한다. `isAvailable`이 false인 morph(리그에 없어 정점이 움직이지 않는 이름)는 건너뛴다 —
 * 정점이 안 움직이는데 본만 움직이면 형상이 찢어진다. 가중치는 엔진 morph influence와 같게 [0, 1]로 자른다.
 */
export function sumJointOffsets(table: MorphJointOffsets, weights: Readonly<Record<string, number>>, isAvailable: (morphName: string) => boolean = () => true): JointOffsetSums {
  const sums = new Map<string, Vec3>();
  for (const [morphName, rawWeight] of Object.entries(weights)) {
    const perBone = table[morphName];
    if (!perBone || !isAvailable(morphName)) continue;
    const weight = Number.isFinite(rawWeight) ? Math.min(1, Math.max(0, rawWeight)) : 0;
    if (weight === 0) continue;
    for (const [bone, offset] of Object.entries(perBone)) {
      if (!offset) continue;
      const previous = sums.get(bone) ?? [0, 0, 0];
      sums.set(bone, [previous[0] + weight * offset[0], previous[1] + weight * offset[1], previous[2] + weight * offset[2]]);
    }
  }
  return sums;
}

/** 두 합이 같은지(미세 오차 이하는 같다고 본다 — 슬라이더 드래그마다 불필요한 역바인드 재생성을 피한다) */
export function sameOffset(a: Vec3 | undefined, b: Vec3 | undefined, epsilon = 1e-9): boolean {
  const left = a ?? [0, 0, 0];
  const right = b ?? [0, 0, 0];
  return Math.abs(left[0] - right[0]) <= epsilon && Math.abs(left[1] - right[1]) <= epsilon && Math.abs(left[2] - right[2]) <= epsilon;
}

export interface JointOffsetSummary {
  /** 오프셋이 하나라도 있는 morph 수 */
  readonly morphCount: number;
  /** 오프셋을 받는 서로 다른 본 수 */
  readonly boneCount: number;
  /** 가장 큰 오프셋 길이(m) */
  readonly maxOffsetM: number;
}

/** 표 요약(능력 보고 문구용) */
export function summarizeJointOffsets(table: MorphJointOffsets | undefined): JointOffsetSummary {
  if (!table) return { morphCount: 0, boneCount: 0, maxOffsetM: 0 };
  const bones = new Set<string>();
  let morphCount = 0;
  let max = 0;
  for (const perBone of Object.values(table)) {
    if (!perBone) continue;
    const entries = Object.entries(perBone).filter(([, offset]) => offset !== undefined);
    if (entries.length === 0) continue;
    morphCount += 1;
    for (const [bone, offset] of entries) {
      if (!offset) continue;
      bones.add(bone);
      max = Math.max(max, Math.hypot(offset[0], offset[1], offset[2]));
    }
  }
  return { morphCount, boneCount: bones.size, maxOffsetM: max };
}
