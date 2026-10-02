/**
 * 머리 파츠의 jaw 본 스킨 웨이트. 캡슐 거리 웨이트(`computeSkinWeights`)의 head 후보는 head·neck뿐이라 jaw 본이 머리 메시에
 * 영향을 주지 못한다. 이 패스가 머리 표면 정점의 head 가중치 일부를 `jawMaskLocal`(FACS 턱 열림 필드와 같은 마스크)만큼
 * jaw로 옮긴다: 위 입술·이마는 head 그대로, 아래 입술·턱·입 안 아래 벽은 jaw를 따른다.
 *   w_jaw' = m · (w_head + w_jaw),  w_head' = (1 − m) · (w_head + w_jaw),  다른 본(neck 등)은 그대로. 합 1·영향 ≤ 4 유지.
 * 결정적·순수 함수다.
 */
import { jawMaskLocal } from "../morph/face-fields";
import { worldToHeadLocal, type HeadFrame } from "../proportions";

import { MAX_INFLUENCES, type SkinWeights } from "./skin-weights";

/**
 * @param positions 용접 정점 위치(모델 공간, ×3) — `weights`와 같은 정점 순서
 * @param frame 머리 프레임(모델 → 머리 로컬)
 */
export function blendJawWeights(positions: Float32Array, weights: SkinWeights, frame: HeadFrame, headIndex: number, jawIndex: number): SkinWeights {
  const jointIndices = new Uint16Array(weights.jointIndices);
  const jointWeights = new Float32Array(weights.jointWeights);
  const vertexCount = positions.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    const mask = jawMaskLocal(worldToHeadLocal(frame, [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]));
    if (mask <= 0) continue;
    const base = v * MAX_INFLUENCES;
    const row = new Map<number, number>();
    for (let i = 0; i < MAX_INFLUENCES; i += 1) {
      const weight = jointWeights[base + i];
      if (weight > 0) row.set(jointIndices[base + i], (row.get(jointIndices[base + i]) ?? 0) + weight);
    }
    const combined = (row.get(headIndex) ?? 0) + (row.get(jawIndex) ?? 0);
    if (combined <= 0) continue; // head 계열이 아닌 정점(목 아래 등)은 건드리지 않는다.
    row.set(headIndex, (1 - mask) * combined);
    row.set(jawIndex, mask * combined);
    const entries = [...row.entries()].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, MAX_INFLUENCES);
    let sum = 0;
    for (const [, weight] of entries) sum += weight;
    for (let i = 0; i < MAX_INFLUENCES; i += 1) {
      const entry = entries[i];
      jointIndices[base + i] = entry ? entry[0] : 0;
      jointWeights[base + i] = entry ? entry[1] / sum : 0;
    }
  }
  return { jointIndices, jointWeights };
}
