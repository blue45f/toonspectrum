/**
 * Webtoon Shaper — 반복 스케치 제거 워크플로우 (S5).
 *
 * 회차별로 캐릭터 포즈 매핑을 저장해 두면, 다음 회차에서 같은 캐릭터의
 * 포즈를 다시 그리지 않고 불러와(recall) 미세 조정할 수 있습니다.
 * 의상·소품이 이전 회차와 달라졌을 때 누락 경고를 내어 연출 일관성을
 * 지킵니다(웹툰 작화의 "전 회차 의상이 바뀌었다" 사고 방지).
 *
 * 순수 데이터+로직 모듈입니다.
 */

import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "../scene-3d/studio-mannequin-model";
import type { StudioMannequinPose } from "../scene-3d/studio-mannequin-poses";

export interface StudioEpisodePoseMapping {
  readonly id: string;
  /** 회차 식별자(예: "ep-12"). */
  readonly episodeId: string;
  /** 캐릭터 식별자(Shaper 모델 보관함의 모델 ID). */
  readonly characterId: string;
  /** 참조한 포즈 프리셋 ID(없으면 자유 포즈). */
  readonly poseId?: string;
  readonly pose: StudioMannequinPose;
  /** 착용한 의상 ID. */
  readonly outfitId?: string;
  /** 착용한 소품 ID 목록. */
  readonly propIds: readonly string[];
  readonly note: string;
  readonly savedAt: number;
}

export class StudioEpisodePoseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioEpisodePoseError";
  }
}

let mappingSequence = 0;

function nextMappingId(): string {
  mappingSequence += 1;
  return `episode-pose-${mappingSequence}`;
}

/**
 * 회차 포즈 매핑을 저장합니다.
 */
export function saveStudioEpisodePoseMapping(
  mappings: readonly StudioEpisodePoseMapping[],
  input: {
    readonly episodeId: string;
    readonly characterId: string;
    readonly poseId?: string;
    readonly pose: StudioMannequinPose;
    readonly outfitId?: string;
    readonly propIds?: readonly string[];
    readonly note?: string;
  },
  now: () => number = () => Date.now(),
): readonly StudioEpisodePoseMapping[] {
  const episodeId = input.episodeId.trim();
  const characterId = input.characterId.trim();
  if (episodeId.length === 0 || characterId.length === 0) {
    throw new StudioEpisodePoseError("회차 ID와 캐릭터 ID는 비어 있을 수 없습니다.");
  }
  const mapping: StudioEpisodePoseMapping = {
    id: nextMappingId(),
    episodeId,
    characterId,
    ...(input.poseId !== undefined ? { poseId: input.poseId } : {}),
    pose: input.pose,
    ...(input.outfitId !== undefined ? { outfitId: input.outfitId } : {}),
    propIds: [...(input.propIds ?? [])],
    note: input.note ?? "",
    savedAt: now(),
  };
  return [...mappings, mapping];
}

/**
 * 캐릭터의 가장 최근 매핑을 불러옵니다(회차 지정 시 해당 회차로 한정).
 * 다음 회차 콘티의 시작점으로 사용합니다.
 */
export function recallStudioEpisodePose(
  mappings: readonly StudioEpisodePoseMapping[],
  query: { readonly characterId: string; readonly episodeId?: string },
): StudioEpisodePoseMapping | undefined {
  const candidates = mappings
    .filter(
      (mapping) =>
        mapping.characterId === query.characterId
        && (query.episodeId === undefined || mapping.episodeId === query.episodeId),
    )
    .sort((a, b) => b.savedAt - a.savedAt);
  return candidates[0];
}

function poseDistance(a: StudioMannequinPose, b: StudioMannequinPose): number {
  const jointIds = new Set<StudioMannequinJointId>([
    ...Object.keys(a.joints),
    ...Object.keys(b.joints),
  ] as StudioMannequinJointId[]);
  let sum = 0;
  for (const jointId of jointIds) {
    const eulerA = a.joints[jointId] ?? [0, 0, 0];
    const eulerB = b.joints[jointId] ?? [0, 0, 0];
    sum += (eulerA[0] - eulerB[0]) ** 2 + (eulerA[1] - eulerB[1]) ** 2 + (eulerA[2] - eulerB[2]) ** 2;
  }
  const offsetA = a.pelvisOffset;
  const offsetB = b.pelvisOffset;
  sum += (offsetA[0] - offsetB[0]) ** 2 + (offsetA[1] - offsetB[1]) ** 2 + (offsetA[2] - offsetB[2]) ** 2;
  return Math.sqrt(sum);
}

export interface StudioSimilarEpisodePose {
  readonly mapping: StudioEpisodePoseMapping;
  /** 유사도 0~1. 1에 가까울수록 비슷합니다. */
  readonly similarity: number;
}

/**
 * 기준 포즈와 유사한 저장 매핑을 유사도 순으로 돌립니다.
 * 불러온 포즈를 미세 조정하는 시작점으로 사용합니다.
 */
export function findSimilarEpisodePoses(
  mappings: readonly StudioEpisodePoseMapping[],
  characterId: string,
  reference: StudioMannequinPose,
  topN = 3,
): readonly StudioSimilarEpisodePose[] {
  return mappings
    .filter((mapping) => mapping.characterId === characterId)
    .map((mapping) => {
      const distance = poseDistance(mapping.pose, reference);
      return { mapping, similarity: Math.round((1 / (1 + distance)) * 1000) / 1000 };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, topN));
}

/**
 * 저장된 포즈에 미세 조정 델타를 적용합니다.
 * 델타는 관절 오일러·골반 오프셋의 차이분입니다.
 */
export function applyStudioEpisodePoseDelta(
  pose: StudioMannequinPose,
  delta: { readonly joints?: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>; readonly pelvisOffset?: StudioMannequinVec3 },
): StudioMannequinPose {
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  const jointIds = new Set<StudioMannequinJointId>([
    ...Object.keys(pose.joints),
    ...Object.keys(delta.joints ?? {}),
  ] as StudioMannequinJointId[]);
  for (const jointId of jointIds) {
    const base = pose.joints[jointId] ?? [0, 0, 0];
    const change = delta.joints?.[jointId] ?? [0, 0, 0];
    joints[jointId] = [base[0] + change[0], base[1] + change[1], base[2] + change[2]];
  }
  const offset = pose.pelvisOffset;
  const offsetChange = delta.pelvisOffset ?? [0, 0, 0];
  return {
    joints,
    pelvisOffset: [offset[0] + offsetChange[0], offset[1] + offsetChange[1], offset[2] + offsetChange[2]],
  };
}

export interface StudioEpisodePoseConsistencyWarning {
  readonly code: "outfit-missing" | "prop-missing";
  readonly message: string;
}

/**
 * 이전 회차 매핑과 현재 설정을 비교해 의상·소품 누락 경고를 냅니다.
 * 이전에 있던 의상/소품이 현재 설정에 없으면 경고를 돌립니다.
 */
export function checkStudioEpisodePoseConsistency(
  previous: StudioEpisodePoseMapping,
  current: { readonly outfitId?: string; readonly propIds: readonly string[] },
): readonly StudioEpisodePoseConsistencyWarning[] {
  const warnings: StudioEpisodePoseConsistencyWarning[] = [];
  if (previous.outfitId && previous.outfitId !== current.outfitId) {
    warnings.push({
      code: "outfit-missing",
      message: `이전 회차 의상(${previous.outfitId})이 현재 설정에 없습니다.`,
    });
  }
  for (const propId of previous.propIds) {
    if (!current.propIds.includes(propId)) {
      warnings.push({
        code: "prop-missing",
        message: `이전 회차 소품(${propId})이 현재 설정에 없습니다.`,
      });
    }
  }
  return warnings;
}
