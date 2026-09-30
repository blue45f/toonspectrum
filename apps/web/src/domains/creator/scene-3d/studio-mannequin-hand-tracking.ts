/**
 * Studio 3D 데생 인형 전용 손(Hand) 추적 모듈.
 *
 * MediaPipe HandLandmarker 의 손 21개 랜드마크를 받아 데생 인형 손목 관절
 * (`leftHand`/`rightHand`, StudioMannequinJointId) 회전(Euler radians)으로 매핑한다.
 * 데생 인형의 손가락은 관절이 아니라 손목에 붙은 장식 프리미티브라서, 손 포즈는
 * 손바닥 프레임(손가락 방향·손바닥 법선)에서 유도한 손목 방향으로만 반영한다.
 *
 * 실시간(VIDEO) 프레임 루프는 절대 멈추면 안 되므로 경계 함수는 fail-soft 다:
 * 손상된 손은 해당 손만 버리고(빈 기여), 루프는 나머지 손/이전 프레임 값으로 계속 간다.
 * 경계 규칙은 VRM 실시간 손 모듈(studio-vrm-video-hand.ts)과 같은 규약이다:
 *  - 손은 최대 2개, 손당 21개 랜드마크, 좌표는 유한수.
 *  - worldLandmarks 가 유효하면 그것을 쓰고, 아니면 정규화 landmarks 로 폴백한다.
 *  - handedness 는 현행 `handedness` 필드 우선, 구 `handednesses` 폴백.
 *  - handedness 신뢰도가 기준 미만이면 그 손을 버린다(신체 경로는 유지).
 *  - 같은 마네킹 측으로 매핑되는 중복 검출은 그 측 전체를 버린다(fail-closed).
 */

import {
  resolveStudioMediaPipeVisionWasmFileset,
  type StudioMediaPipeVisionDelegate,
  type StudioMediaPipeVisionWasmSelection,
} from "../studio-mediapipe-vision-assets";
import {
  loadStudioMediaPipeVisionModule,
  runStudioMediaPipeVisionTaskCreation,
} from "../studio-mediapipe-vision-init-arbiter";
import {
  avatarSideForHand,
  HAND_LM,
  type HandLandmark,
} from "../vrm/studio-vrm-hand-solver";

import type { StudioMannequinVec3 } from "./studio-mannequin-model";

export const STUDIO_MANNEQUIN_HAND_LANDMARK_COUNT = 21 as const;
export const STUDIO_MANNEQUIN_HAND_MAX_HANDS = 2 as const;
export const STUDIO_MANNEQUIN_HAND_DEFAULT_MIN_CONFIDENCE = 0.5 as const;

export type StudioMannequinHandSide = "left" | "right";
export type StudioMannequinHandJointId = "leftHand" | "rightHand";

export interface StudioMannequinHandLandmarkPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioMannequinHandednessCategory {
  readonly categoryName: string;
  readonly score: number;
}

/** HandLandmarker.detectForVideo 결과의 최소 구조 경계. */
export interface StudioMannequinHandLandmarkerDetection {
  readonly landmarks?: readonly (readonly StudioMannequinHandLandmarkPoint[])[];
  readonly worldLandmarks?: readonly (readonly StudioMannequinHandLandmarkPoint[])[];
  readonly handedness?: readonly (readonly StudioMannequinHandednessCategory[])[];
  readonly handednesses?: readonly (readonly StudioMannequinHandednessCategory[])[];
  readonly close?: () => void;
}

export interface StudioMannequinHandFrameOptions {
  /** 셀카 거울 모드. VRM 실시간 손 경로의 mirror 와 같은 의미. */
  readonly mirror: boolean;
  /** handedness 신뢰도 하한(0~1). 기본 0.5. 범위 밖 값은 기본값으로 대체. */
  readonly minimumHandednessConfidence?: number;
}

export interface StudioMannequinHandFrameResult {
  /** 손목 관절 ID → Euler radians. 버려진 손은 기여 없음. */
  readonly wrists: Partial<Record<StudioMannequinHandJointId, StudioMannequinVec3>>;
  /** 이번 프레임에서 실제로 손목 회전을 만든 마네킹 측. */
  readonly detectedSides: readonly StudioMannequinHandSide[];
  /** 중복 매핑으로 fail-closed 된 마네킹 측. */
  readonly droppedSides: readonly StudioMannequinHandSide[];
}

const EMPTY_HAND_FRAME_RESULT: StudioMannequinHandFrameResult = Object.freeze({
  wrists: Object.freeze({}),
  detectedSides: Object.freeze([]),
  droppedSides: Object.freeze([]),
});

function handJointIdForSide(side: StudioMannequinHandSide): StudioMannequinHandJointId {
  return side === "left" ? "leftHand" : "rightHand";
}

// ── 손목 오일러 솔버 ─────────────────────────────────────────────────────────

/** 퇴화한(길이가 0에 가까운) 벡터는 손목 방향을 정할 수 없으므로 null 을 돌린다. */
type HandVec3 = readonly [number, number, number];

function handVecBetween(a: HandVec3, b: HandVec3): HandVec3 {
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

function handVecNormalize(v: HandVec3): HandVec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(length) || length < 1e-8) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function handVecCross(a: HandVec3, b: HandVec3): HandVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function readHandPoint(
  landmarks: readonly HandLandmark[],
  index: number,
): HandVec3 | null {
  const point = landmarks[index];
  if (!point) return null;
  const { x, y, z } = point;
  if (
    typeof x !== "number" || typeof y !== "number" || typeof z !== "number"
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
  ) {
    return null;
  }
  return [x, y, z];
}

/**
 * 한 손의 21개 랜드마크 → 손목 관절 Euler radians.
 *
 * 손바닥 프레임에서 직관적인 세 각을 뽑는다(랜드마크 공간: x=오른쪽, y=아래, z=관찰자 쪽).
 * 뽑은 값은 `rotation.set` 에 바로 넣으면 화면에서 본 손 방향과 일치하도록 부호를 맞췄다:
 *  - X(pitch): 손가락 방향 f 의 상하 기울임. `atan2(-f.z, f.y)`.
 *  - Y(yaw): 손바닥 법선 n 의 좌우 방향(회내/회외). `atan2(n.x, n.z)`.
 *  - Z(roll): 손가락 축 둘레의 손목 기울임. `atan2(-m.y, m.x)` (m = f×n).
 * 휴식 자세(손가락 아래·손바닥 정면)에서는 세 각이 모두 0에 가깝다.
 *
 * `side` 는 랜드마크 기하 자체의 좌우(엄지가 +x 면 left)다. 아바타 관절 측과 다를 수
 * 있다(미러 모드에서는 반대가 된다). across 순서는 기하 측에 맞춰 손바닥 법선 부호를
 * 통일한다.
 *
 * 주의: 이 값은 카메라 기준 근사치다. 실제 관절 로컬 회전은 팔꿈치 체인의 영향을
 * 받으므로, 호출부에서 clampStudioMannequinJointRotation 과 EMA 스무딩을 함께 쓴다.
 * 미러(거울 따라하기)는 여기서 좌표를 뒤집지 않는다. 입력 x 를 뒤집어 재계산하면
 * 회전의 손잡이성이 깨진다는 신체 경로의 경고를 그대로 따른다: 미러는 프레임 경계에서
 * 하우스 미러 계약(YZ 평면 반사 = X 유지·Y/Z 부호 반전 + 관절 측 스왑)으로 적용한다.
 * 입력이 퇴화했으면(21개 미만·비유한·길이 0 분절) null 을 돌리고 절대 예외를 던지지 않는다.
 */
export function solveMannequinHandWristEuler(
  landmarks: readonly HandLandmark[] | undefined,
  side: StudioMannequinHandSide,
): StudioMannequinVec3 | null {
  if (!landmarks || landmarks.length < STUDIO_MANNEQUIN_HAND_LANDMARK_COUNT) return null;
  if (side !== "left" && side !== "right") return null;

  const wrist = readHandPoint(landmarks, HAND_LM.wrist);
  const middleMcp = readHandPoint(landmarks, HAND_LM.middleMcp);
  const indexMcp = readHandPoint(landmarks, HAND_LM.indexMcp);
  const littleMcp = readHandPoint(landmarks, HAND_LM.littleMcp);
  if (!wrist || !middleMcp || !indexMcp || !littleMcp) return null;

  const fingerDir = handVecNormalize(handVecBetween(wrist, middleMcp));
  if (!fingerDir) return null;
  // across 는 항상 "외측→내측"이 아니라 측별로 뒤집어 손바닥 법선 부호를 통일한다.
  const acrossRaw = side === "left"
    ? handVecBetween(indexMcp, littleMcp)
    : handVecBetween(littleMcp, indexMcp);
  const across = handVecNormalize(acrossRaw);
  if (!across) return null;
  const palmNormal = handVecNormalize(handVecCross(fingerDir, across));
  if (!palmNormal) return null;
  const thirdAxis = handVecNormalize(handVecCross(fingerDir, palmNormal));
  if (!thirdAxis) return null;

  const pitch = Math.atan2(-fingerDir[2], fingerDir[1]);
  const yaw = Math.atan2(palmNormal[0], palmNormal[2]);
  const roll = Math.atan2(-thirdAxis[1], thirdAxis[0]);
  if (!Number.isFinite(pitch) || !Number.isFinite(yaw) || !Number.isFinite(roll)) return null;
  return [pitch, yaw, roll];
}

/**
 * 손목 오일러의 "거울 따라하기" 반사. 하우스 미러 계약(YZ 평면 반사 = X 유지·Y/Z 부호
 * 반전)과 같은 규약으로, 신체 경로의 미러(`mirrorBone`, pose solver)와 일치한다.
 * 관절 측 스왑은 호출부가 `avatarSideForHand` 으로 처리하므로 여기서는 오일러만 반사한다.
 */
export function mirrorStudioMannequinHandEuler(
  euler: StudioMannequinVec3,
): StudioMannequinVec3 {
  return [euler[0], -euler[1], -euler[2]];
}

/**
 * HandLandmarker 라벨 → 랜드마크 기하 자체의 좌우. 라벨은 셀카(미러) 입력을 가정해
 * 뒤집혀 나오므로, 기하 측을 복원하려면 미러와 무관하게 항상 스왑한다.
 * (`avatarSideForHand(label, false)` 와 같다.)
 */
function geometrySideForHandLabel(label: "Left" | "Right"): StudioMannequinHandSide {
  return avatarSideForHand(label, false);
}

// ── 사진 경로: 검증된 손 검출 → 손목 회전 ────────────────────────────────────

export interface StudioMannequinHandDetectionInput {
  /** 구동할 아바타 관절 측. */
  readonly side: StudioMannequinHandSide;
  /** 원시 handedness 라벨. 기하 측 복원에 쓴다(셀카 가정으로 뒤집혀 있음). */
  readonly handedness: "Left" | "Right";
  readonly worldLandmarks: readonly HandLandmark[];
}

export interface StudioMannequinHandWristsResult {
  readonly wrists: Partial<Record<StudioMannequinHandJointId, StudioMannequinVec3>>;
  readonly appliedSides: readonly StudioMannequinHandSide[];
  readonly skippedSides: readonly StudioMannequinHandSide[];
}

/**
 * 사진 스캐너의 검증된 손 검출 목록을 손목 회전으로 변환한다.
 * 사진은 "있는 그대로 복사" 경로라 미러 반사를 적용하지 않는다: 기하 측으로 푼
 * 오일러를 아바타 관절 측에 그대로 얹는다(사용자가 사진을 좌우반전했어도 픽셀에
 * 이미 반영돼 있어 복사하면 된다).
 * 같은 측 중복 검출은 그 측 전체를 fail-closed 로 버리고, 손상된 검출은 건너뛴다.
 * 절대 예외를 던지지 않는다(호출부는 skippedSides 를 skippedJoints 에 기록한다).
 */
export function solveMannequinHandWristsFromDetections(
  detections: readonly StudioMannequinHandDetectionInput[] | undefined,
): StudioMannequinHandWristsResult {
  const wrists: Partial<Record<StudioMannequinHandJointId, StudioMannequinVec3>> = {};
  const appliedSides: StudioMannequinHandSide[] = [];
  const skippedSides: StudioMannequinHandSide[] = [];
  if (!detections || detections.length === 0) {
    return { wrists, appliedSides, skippedSides };
  }
  if (detections.length > STUDIO_MANNEQUIN_HAND_MAX_HANDS) {
    // 프로토콜 위반: 손이 3개 이상이면 전체를 버린다.
    return {
      wrists,
      appliedSides,
      skippedSides: (["left", "right"] as const).slice(),
    };
  }

  const candidates: Array<{ side: StudioMannequinHandSide; euler: StudioMannequinVec3 }> = [];
  for (const detection of detections) {
    const side = detection?.side;
    const handedness = detection?.handedness;
    if (side !== "left" && side !== "right") continue;
    if (handedness !== "Left" && handedness !== "Right") {
      if (!skippedSides.includes(side)) skippedSides.push(side);
      continue;
    }
    const euler = solveMannequinHandWristEuler(
      detection.worldLandmarks,
      geometrySideForHandLabel(handedness),
    );
    if (!euler) {
      if (!skippedSides.includes(side)) skippedSides.push(side);
      continue;
    }
    candidates.push({ side, euler });
  }

  const counts = new Map<StudioMannequinHandSide, number>();
  for (const candidate of candidates) {
    counts.set(candidate.side, (counts.get(candidate.side) ?? 0) + 1);
  }
  const duplicated = (["left", "right"] as const).filter((side) => (counts.get(side) ?? 0) > 1);
  for (const candidate of candidates) {
    if (duplicated.includes(candidate.side)) {
      if (!skippedSides.includes(candidate.side)) skippedSides.push(candidate.side);
      continue;
    }
    wrists[handJointIdForSide(candidate.side)] = candidate.euler;
    appliedSides.push(candidate.side);
  }
  return { wrists, appliedSides, skippedSides };
}

// ── 실시간(VIDEO) 프레임 경계 ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyHandLandmarkArray(
  value: unknown,
  normalized: boolean,
): readonly HandLandmark[] | null {
  if (!Array.isArray(value) || value.length !== STUDIO_MANNEQUIN_HAND_LANDMARK_COUNT) return null;
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

/**
 * VIDEO HandLandmarker 결과 한 프레임을 마네킹 손목 회전으로 변환한다.
 * malformed 입력에는 절대 예외를 던지지 않고 빈 기여로 버린다.
 */
export function createStudioMannequinHandFrameResult(
  rawResult: unknown,
  options: StudioMannequinHandFrameOptions,
): StudioMannequinHandFrameResult {
  const mirror = options?.mirror !== false;
  const requestedMinimum = options?.minimumHandednessConfidence
    ?? STUDIO_MANNEQUIN_HAND_DEFAULT_MIN_CONFIDENCE;
  const minimumConfidence = Number.isFinite(requestedMinimum) && requestedMinimum >= 0 && requestedMinimum <= 1
    ? requestedMinimum
    : STUDIO_MANNEQUIN_HAND_DEFAULT_MIN_CONFIDENCE;

  if (!isRecord(rawResult)) return EMPTY_HAND_FRAME_RESULT;
  const detection = rawResult as Partial<StudioMannequinHandLandmarkerDetection>;
  const normalizedSets = detection.landmarks;
  if (!Array.isArray(normalizedSets) || normalizedSets.length === 0) {
    return EMPTY_HAND_FRAME_RESULT;
  }
  const worldSets = Array.isArray(detection.worldLandmarks) ? detection.worldLandmarks : [];
  // 현행 `handedness` 우선, deprecated `handednesses` 폴백.
  const handednessSets = Array.isArray(detection.handedness)
    ? detection.handedness
    : Array.isArray(detection.handednesses)
      ? detection.handednesses
      : [];

  const handCount = Math.min(normalizedSets.length, STUDIO_MANNEQUIN_HAND_MAX_HANDS);
  const accepted: Array<{ side: StudioMannequinHandSide; euler: StudioMannequinVec3 }> = [];
  for (let index = 0; index < handCount; index += 1) {
    const label = readHandednessLabel(handednessSets, index, minimumConfidence);
    if (!label) continue;
    // 구동할 관절 측은 미러 모드 기준, 기하 측(엄지 방향)은 라벨의 뒤집힘을 복원한 값.
    // 신체 경로와 같은 "거울 따라하기": 기하 프레임에서 풀고 오일러만 YZ 반사한다.
    // 입력 x 를 뒤집어 재계산하지 않는다(손잡이성이 깨진다는 신체 경로의 경고와 동일).
    const side = avatarSideForHand(label, mirror);
    const geometrySide = geometrySideForHandLabel(label);
    // 월드 좌표 우선, 무효하면 정규화 좌표로 폴백.
    const landmarks = copyHandLandmarkArray(worldSets[index], false)
      ?? copyHandLandmarkArray(normalizedSets[index], true);
    if (!landmarks) continue;
    const euler = solveMannequinHandWristEuler(landmarks, geometrySide);
    if (!euler) continue;
    accepted.push({ side, euler: mirror ? mirrorStudioMannequinHandEuler(euler) : euler });
  }

  const counts = new Map<StudioMannequinHandSide, number>();
  for (const candidate of accepted) {
    counts.set(candidate.side, (counts.get(candidate.side) ?? 0) + 1);
  }
  const droppedSides = (["left", "right"] as const)
    .filter((side) => (counts.get(side) ?? 0) > 1);
  const solved = accepted.filter((candidate) => !droppedSides.includes(candidate.side));

  const wrists: Partial<Record<StudioMannequinHandJointId, StudioMannequinVec3>> = {};
  const detectedSides: StudioMannequinHandSide[] = [];
  for (const candidate of solved) {
    wrists[handJointIdForSide(candidate.side)] = candidate.euler;
    detectedSides.push(candidate.side);
  }

  return Object.freeze({
    wrists: Object.freeze(wrists),
    detectedSides: Object.freeze(detectedSides),
    droppedSides: Object.freeze(droppedSides),
  });
}

// ── HandLandmarker (VIDEO) 싱글톤 ────────────────────────────────────────────

/**
 * 손 모델은 직접 fetch 해서 MediaPipe 에 `modelAssetBuffer` 로 넘긴다. 모델 다운로드
 * 실패와 동일 출처 Wasm 로더 실패를 구분하기 위해서이며, 신체 pose landmarker 계약
 * (studio-mannequin-webcam-tracking.ts)과 같은 방식이다. 호스트는 프로덕션 CSP 에서
 * 허용된 주소다.
 */
export const STUDIO_MANNEQUIN_HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const STUDIO_MANNEQUIN_HAND_MODEL_TIMEOUT_MS = 20_000;

export interface StudioMannequinHandLandmarker {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): StudioMannequinHandLandmarkerDetection;
  close(): void;
}

export type StudioMannequinHandLandmarkerFactory = (
  signal?: AbortSignal,
  delegate?: StudioMediaPipeVisionDelegate,
) => Promise<StudioMannequinHandLandmarker>;

export interface StudioMannequinHandLandmarkerInitOptions {
  readonly signal?: AbortSignal;
  /** 모델/task 작업 전에 고정한다. 생략하면 제품 기본 GPU 제공자를 쓴다. */
  readonly delegate?: StudioMediaPipeVisionDelegate;
  /** 테스트/호스트 주입용. 프로덕션 호출부는 비워 둔다. */
  readonly factory?: StudioMannequinHandLandmarkerFactory;
}

function createHandNamedError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message);
  error.name = name;
  if (cause !== undefined) {
    (error as Error & { cause?: unknown }).cause = cause;
  }
  return error;
}

function createHandDisposedError(): Error {
  return createHandNamedError(
    "AbortError",
    "Studio mannequin hand landmarker initialization was cancelled.",
  );
}

function safelyCloseHandLandmarker(landmarker: StudioMannequinHandLandmarker): void {
  try {
    landmarker.close();
  } catch {
    // 정리는 best-effort. MediaPipe close 실패가 카메라 스트림을 켜진 채로 두면 안 된다.
  }
}

/**
 * 브라우저/MediaPipe 실패를 짧고 실행 가능한 한글 안내로 바꾼다. 원본 오류는 패널이
 * 콘솔에 남겨 진단에 쓴다. 카메라 권한 단계는 신체 추적과 같은 카메라를 공유하므로
 * 이 함수는 손 모델·엔진 단계만 다룬다.
 */
export function getStudioMannequinHandTrackingErrorMessage(cause: unknown): string {
  const name = cause && typeof cause === "object" && "name" in cause
    ? String((cause as { name?: unknown }).name ?? "")
    : "";

  if (name === "StudioMannequinHandModelTimeoutError") {
    return "손 인식 모델을 불러오는 데 시간이 오래 걸렸습니다. 네트워크를 확인하고 다시 시도해 주세요.";
  }
  if (name === "StudioMannequinHandModelLoadError") {
    return "손 인식 모델을 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.";
  }
  if (name === "StudioMannequinHandVisionWasmLoadError") {
    return "브라우저가 손 인식 엔진 파일을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }
  if (name === "StudioMannequinHandEngineCreationError") {
    return "손 인식 엔진을 준비하지 못했습니다. 다른 탭을 닫고 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }
  return "실시간 손 인식을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function resolveHandVisionWasmFileset(
  isSimdSupported: () => Promise<boolean>,
): Promise<StudioMediaPipeVisionWasmSelection> {
  try {
    return await resolveStudioMediaPipeVisionWasmFileset({ isSimdSupported });
  } catch (cause) {
    throw createHandNamedError(
      "StudioMannequinHandVisionWasmLoadError",
      "Failed to resolve the local MediaPipe Vision Wasm fileset for hand tracking.",
      cause,
    );
  }
}

async function fetchHandModelBuffer(signal?: AbortSignal): Promise<Uint8Array> {
  const requestController = new AbortController();
  let timedOut = false;
  const handleParentAbort = () => requestController.abort(signal?.reason);
  if (signal?.aborted) handleParentAbort();
  else signal?.addEventListener("abort", handleParentAbort, { once: true });

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, STUDIO_MANNEQUIN_HAND_MODEL_TIMEOUT_MS);

  try {
    const response = await fetch(STUDIO_MANNEQUIN_HAND_MODEL_URL, {
      cache: "force-cache",
      signal: requestController.signal,
    });
    if (!response.ok) {
      throw new Error(`Hand model request returned HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    if (signal?.aborted) throw createHandDisposedError();
    if (timedOut) {
      throw createHandNamedError(
        "StudioMannequinHandModelTimeoutError",
        "Timed out while downloading the mannequin hand model.",
        cause,
      );
    }
    throw createHandNamedError(
      "StudioMannequinHandModelLoadError",
      "Failed to download the mannequin hand model.",
      cause,
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", handleParentAbort);
  }
}

async function createStudioMannequinHandLandmarker(
  signal?: AbortSignal,
  delegate: StudioMediaPipeVisionDelegate = "GPU",
): Promise<StudioMannequinHandLandmarker> {
  if (signal?.aborted) throw createHandDisposedError();

  const { FilesetResolver, HandLandmarker } = await loadStudioMediaPipeVisionModule();
  const [visionSelection, modelAssetBuffer] = await Promise.all([
    resolveHandVisionWasmFileset(() => FilesetResolver.isSimdSupported(false)),
    fetchHandModelBuffer(signal),
  ]);
  if (signal?.aborted) throw createHandDisposedError();

  const handOptions = {
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  } as const;

  try {
    return await runStudioMediaPipeVisionTaskCreation({
      owner: "mannequin-video-hand",
      signal,
      create: () => HandLandmarker.createFromOptions(visionSelection.fileset, {
        baseOptions: { modelAssetBuffer: modelAssetBuffer.slice(), delegate },
        ...handOptions,
      }),
    });
  } catch (cause) {
    if (signal?.aborted) throw createHandDisposedError();
    throw createHandNamedError(
      "StudioMannequinHandEngineCreationError",
      `Failed to create the selected ${delegate} mannequin HandLandmarker.`,
      cause,
    );
  }
}

let cachedHandLandmarker: StudioMannequinHandLandmarker | null = null;
let cachedHandLandmarkerDelegate: StudioMediaPipeVisionDelegate | null = null;
let initHandLandmarkerPromise: Promise<StudioMannequinHandLandmarker> | null = null;
let initHandLandmarkerPromiseGeneration: number | null = null;
let initHandLandmarkerPromiseDelegate: StudioMediaPipeVisionDelegate | null = null;
let handLandmarkerGeneration = 0;

function handDelegateIdentityError(): Error {
  return createHandNamedError(
    "StudioMannequinHandDelegateIdentityError",
    "The mannequin MediaPipe hand singleton is already owned by another delegate.",
  );
}

/**
 * 데생 인형 전용 VIDEO 모드 손 싱글톤. pose landmarker 와 절대 공유하지 않는다:
 * 어느 한쪽 task 를 멈춰도 다른 쪽의 활성 task 를 닫으면 안 된다.
 */
export async function initStudioMannequinHandLandmarker(
  options: StudioMannequinHandLandmarkerInitOptions = {},
): Promise<StudioMannequinHandLandmarker> {
  if (options.signal?.aborted) throw createHandDisposedError();
  const delegate = options.delegate ?? "GPU";
  if (cachedHandLandmarker) {
    if (cachedHandLandmarkerDelegate !== delegate) {
      throw handDelegateIdentityError();
    }
    return cachedHandLandmarker;
  }
  if (initHandLandmarkerPromise) {
    if (initHandLandmarkerPromiseGeneration === handLandmarkerGeneration) {
      if (initHandLandmarkerPromiseDelegate !== delegate) {
        throw handDelegateIdentityError();
      }
      return initHandLandmarkerPromise;
    }
    // dispose 직후 재시도가 이전 MediaPipe ModuleFactory 초기화와 겹치면 전역 WASM
    // loader 상태가 경쟁한다. 이전 세대가 정리될 때까지 직렬화한 뒤 새 factory를 시작한다.
    try {
      await initHandLandmarkerPromise;
    } catch {
      // 이전 세대는 AbortError 로 reject 되는 게 정상이다.
    }
    if (options.signal?.aborted) throw createHandDisposedError();
    if (cachedHandLandmarker) {
      if (cachedHandLandmarkerDelegate !== delegate) {
        throw handDelegateIdentityError();
      }
      return cachedHandLandmarker;
    }
    return initStudioMannequinHandLandmarker(options);
  }

  const generation = handLandmarkerGeneration;
  const factory = options.factory ?? createStudioMannequinHandLandmarker;
  const pending = (async () => {
    const landmarker = await factory(options.signal, delegate);
    if (generation !== handLandmarkerGeneration || options.signal?.aborted) {
      safelyCloseHandLandmarker(landmarker);
      throw createHandDisposedError();
    }
    cachedHandLandmarker = landmarker;
    cachedHandLandmarkerDelegate = delegate;
    return landmarker;
  })();
  initHandLandmarkerPromise = pending;
  initHandLandmarkerPromiseGeneration = generation;
  initHandLandmarkerPromiseDelegate = delegate;

  try {
    return await pending;
  } finally {
    if (initHandLandmarkerPromise === pending) {
      initHandLandmarkerPromise = null;
      initHandLandmarkerPromiseGeneration = null;
      initHandLandmarkerPromiseDelegate = null;
    }
  }
}

/** 진행 중인 초기화를 취소하고, 마네킹이 소유한 VIDEO 손 task 만 해제한다. */
export function disposeStudioMannequinHandLandmarker(): void {
  handLandmarkerGeneration += 1;
  const landmarker = cachedHandLandmarker;
  cachedHandLandmarker = null;
  cachedHandLandmarkerDelegate = null;
  // 진행 중 factory는 실제 취소할 수 없으므로 promise 권위를 유지한다. 다음 retry는 위
  // init 경로에서 settlement까지 기다려 global MediaPipe 초기화를 절대 중첩하지 않는다.
  if (landmarker) safelyCloseHandLandmarker(landmarker);
}
