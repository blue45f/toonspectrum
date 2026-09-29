// 실시간(VIDEO) MediaPipe HandLandmarker 결과 → VRM 손가락 본 회전 경계 모듈.
//
// 사진(IMAGE) 경로(studio-vrm-photo-hand.ts)는 프로토콜 위반 시 예외를 던지지만,
// 실시간 프레임 루프는 절대 멈추면 안 되므로 이 모듈은 fail-soft 다: 손상된 손은
// 해당 손만 버리고(solve → 빈 기여), 루프는 나머지 손/이전 프레임 값으로 계속 간다.
//
// 경계 규칙(사진 경로와 동일 규약):
//  - 손은 최대 2개, 손당 21개 랜드마크, 좌표는 유한수.
//  - worldLandmarks 가 유효하면 그것을 쓰고(사진 솔버와 같은 입력), 아니면
//    정규화 landmarks 로 폴백한다.
//  - handedness 는 현행 `handedness` 필드 우선, 구 `handednesses` 폴백.
//  - handedness 신뢰도가 기준 미만이면 그 손을 버린다(몸통/얼굴 경로는 유지).
//  - 같은 아바타 측으로 매핑되는 중복 검출은 그 측 전체를 버린다(배열 순서에
//    따라 덮어쓰지 않는다 — 사진 경로의 ambiguous-side 와 동일).

import {
  avatarSideForHand,
  solveHandToFingerBones,
  type FingerEulerMap,
  type HandLandmark,
} from "./studio-vrm-hand-solver";

export const STUDIO_VRM_VIDEO_HAND_LANDMARK_COUNT = 21 as const;
export const STUDIO_VRM_VIDEO_HAND_MAX_HANDS = 2 as const;
export const STUDIO_VRM_VIDEO_HAND_DEFAULT_MIN_CONFIDENCE = 0.5 as const;

export type StudioVrmVideoHandSide = "left" | "right";

export interface StudioVrmVideoHandOptions {
  /** 셀카 거울 모드. 사진 경로의 mirrorHorizontal 과 같은 의미. */
  readonly mirror: boolean;
  /** handedness 신뢰도 하한(0~1). 기본 0.5. 범위 밖 값은 기본값으로 대체. */
  readonly minimumHandednessConfidence?: number;
}

export interface StudioVrmVideoHandFrameResult {
  /** VRM 손가락 본 이름 → Euler radians. 버려진 손은 기여 없음. */
  readonly fingers: FingerEulerMap;
  /** 이번 프레임에서 실제로 손가락 회전을 만든 아바타 측. */
  readonly detectedSides: readonly StudioVrmVideoHandSide[];
  /** 중복 매핑으로 fail-closed 된 아바타 측. */
  readonly droppedSides: readonly StudioVrmVideoHandSide[];
}

const EMPTY_RESULT: StudioVrmVideoHandFrameResult = Object.freeze({
  fingers: Object.freeze({}),
  detectedSides: Object.freeze([]),
  droppedSides: Object.freeze([]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyLandmarkArray(value: unknown, normalized: boolean): readonly HandLandmark[] | null {
  if (!Array.isArray(value) || value.length !== STUDIO_VRM_VIDEO_HAND_LANDMARK_COUNT) return null;
  const maximum = normalized ? 100 : 10_000;
  const copied: HandLandmark[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const coordinates = [entry.x, entry.y, entry.z];
    if (coordinates.some((coordinate) => (
      typeof coordinate !== "number"
      || !Number.isFinite(coordinate)
      || Math.abs(coordinate) > maximum
    ))) return null;
    copied.push({ x: entry.x as number, y: entry.y as number, z: entry.z as number });
  }
  return copied;
}

function readHandednessLabel(
  handednessSets: readonly unknown[],
  index: number,
  minimumConfidence: number,
): "Left" | "Right" | null {
  const categories = handednessSets[index];
  if (!Array.isArray(categories) || categories.length !== 1) return null;
  const category = categories[0];
  if (!isRecord(category)) return null;
  const label = category.categoryName;
  const confidence = category.score;
  if ((label !== "Left" && label !== "Right") || typeof confidence !== "number") return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (confidence < minimumConfidence) return null;
  return label;
}

function copyFingerEdits(value: FingerEulerMap): FingerEulerMap {
  const copied: FingerEulerMap = {};
  for (const [bone, rotation] of Object.entries(value)) {
    if (
      !Array.isArray(rotation)
      || rotation.length !== 3
      || rotation.some((axis) => typeof axis !== "number" || !Number.isFinite(axis))
    ) continue;
    copied[bone] = [rotation[0], rotation[1], rotation[2]];
  }
  return copied;
}

/**
 * VIDEO HandLandmarker 결과 한 프레임을 VRM 손가락 회전으로 변환한다.
 * malformed 입력에는 절대 예외를 던지지 않고 빈 기여로 버린다.
 */
export function createStudioVrmVideoHandFrameResult(
  rawResult: unknown,
  options: StudioVrmVideoHandOptions,
): StudioVrmVideoHandFrameResult {
  const mirror = options?.mirror !== false;
  const requestedMinimum = options?.minimumHandednessConfidence
    ?? STUDIO_VRM_VIDEO_HAND_DEFAULT_MIN_CONFIDENCE;
  const minimumConfidence = Number.isFinite(requestedMinimum) && requestedMinimum >= 0 && requestedMinimum <= 1
    ? requestedMinimum
    : STUDIO_VRM_VIDEO_HAND_DEFAULT_MIN_CONFIDENCE;

  if (!isRecord(rawResult)) return EMPTY_RESULT;
  const normalizedSets = rawResult.landmarks;
  if (!Array.isArray(normalizedSets) || normalizedSets.length === 0) return EMPTY_RESULT;
  const worldSets = Array.isArray(rawResult.worldLandmarks) ? rawResult.worldLandmarks : [];
  // 현행 `handedness` 우선, deprecated `handednesses` 폴백.
  const handednessSets = Array.isArray(rawResult.handedness)
    ? rawResult.handedness
    : Array.isArray(rawResult.handednesses)
      ? rawResult.handednesses
      : [];

  const handCount = Math.min(normalizedSets.length, STUDIO_VRM_VIDEO_HAND_MAX_HANDS);
  const accepted: Array<{ side: StudioVrmVideoHandSide; landmarks: readonly HandLandmark[] }> = [];
  for (let index = 0; index < handCount; index += 1) {
    const label = readHandednessLabel(handednessSets, index, minimumConfidence);
    if (!label) continue;
    // 월드 좌표 우선(사진 경로와 같은 솔버 입력), 무효하면 정규화 좌표로 폴백.
    const landmarks = copyLandmarkArray(worldSets[index], false)
      ?? copyLandmarkArray(normalizedSets[index], true);
    if (!landmarks) continue;
    accepted.push({ side: avatarSideForHand(label, mirror), landmarks });
  }

  const counts = new Map<StudioVrmVideoHandSide, number>();
  for (const candidate of accepted) {
    counts.set(candidate.side, (counts.get(candidate.side) ?? 0) + 1);
  }
  const droppedSides = (["left", "right"] as const)
    .filter((side) => (counts.get(side) ?? 0) > 1);
  const solved = accepted.filter((candidate) => !droppedSides.includes(candidate.side));

  const fingers: FingerEulerMap = {};
  for (const detection of solved) {
    Object.assign(fingers, solveHandToFingerBones(detection.landmarks, detection.side));
  }

  return Object.freeze({
    fingers: Object.freeze(copyFingerEdits(fingers)),
    detectedSides: Object.freeze(solved.map((detection) => detection.side)),
    droppedSides: Object.freeze(droppedSides),
  });
}
