// 웹캠 얼굴 추적 → VRM 캐릭터 제어 모듈.
// MediaPipe FaceLandmarker로 얼굴 블렌드셰이프 + 변환 행렬을 추출하고,
// EMA 스무딩을 거쳐 VRM 뼈 회전(head/neck) + 표정(blink/mouth/brow/gaze)으로 매핑한다.
//
// 설계 원칙:
//  - FaceLandmarker 인스턴스는 lazy 싱글턴으로 관리(초기화 비용 1회).
//  - Pure 함수(processTrackingResult, smoothRawChannels, convertChannelsToVrmData)는
//    MediaPipe 의존 없이 단위 테스트 가능하다.
//  - TrackingChannels는 "카메라 좌표계"(미러 전)이고,
//    convertChannelsToVrmData에서 mirrorMode·gazeLock·sensitivity를 반영한다.

import { solvePoseToVrmBones } from "./studio-vrm-pose-solver";

import type {
  FaceLandmarker,
  FaceLandmarkerResult,
  HandLandmarker,
  PoseLandmarker,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";


/* ── Public Types ─────────────────────────────────────────────────────── */

/** 카메라에서 추출한 원시(raw) 얼굴 채널. 모든 값은 카메라 좌표계 기준. */
export interface TrackingChannels {
  /** 끄덕임 상하 (radians) */
  headPitch: number;
  /** 좌우 회전 (radians) */
  headYaw: number;
  /** 좌우 기울임 (radians) */
  headRoll: number;
  /** 왼눈 깜빡임 0-1 */
  blinkLeft: number;
  /** 오른눈 깜빡임 0-1 */
  blinkRight: number;
  /** 시선 X -1(왼)~1(오) */
  gazeX: number;
  /** 시선 Y -1(아래)~1(위) */
  gazeY: number;
  /** 입 벌림 0-1 */
  mouthOpen: number;
  /** 미소 0-1 */
  mouthSmile: number;
  /** 눈썹 안쪽 올림 0-1 */
  browInnerUp: number;
  /** 왼쪽 눈썹 바깥 올림 0-1 */
  browOuterUpLeft: number;
  /** 오른쪽 눈썹 바깥 올림 0-1 */
  browOuterUpRight: number;
}

/** 트래킹 후처리 옵션. */
export interface TrackingOptions {
  /** true이면 시선을 정면 고정(캐릭터가 관객을 바라봄). */
  gazeLock: boolean;
  /** true이면 좌우를 거울 반전(셀프카메라 모드). */
  mirrorMode: boolean;
  /** 채널 감도 배율(0.5=둔감, 2=예민). */
  sensitivity: number;
  /** 스무딩 필터 값 (0.05=매우 부드러움, 1=즉각 반영) */
  smoothing: number;
  /** true이면 손가락 추적(HandLandmarker) 사용. */
  fingerTracking: boolean;
}

/** VRM 캐릭터에 적용할 뼈 회전 + 표정 가중치. */
export interface VrmTrackingData {
  /** VRM 뼈 이름 → [pitch, yaw, roll] Euler radians. */
  bones: Record<string, readonly [number, number, number]>;
  /** VRM 표정 이름 → 0-1 가중치. */
  expressions: Record<string, number>;
  /** 손가락 본 이름 → Euler radians (손가락 추적 시). */
  fingers?: Record<string, readonly [number, number, number]>;
}

/* ── Constants ────────────────────────────────────────────────────────── */

/** EMA 스무딩 계수. 0에 가까울수록 부드럽고 반응 느림, 1이면 즉시 반영. */
export const SMOOTHING_ALPHA = 0.35;

/** 기본 트래킹 옵션. */
export const DEFAULT_TRACKING_OPTIONS: Readonly<TrackingOptions> = {
  gazeLock: false,
  mirrorMode: true,
  sensitivity: 1,
  smoothing: 0.35,
  fingerTracking: true,
};

/** CDN 에셋 경로 — MediaPipe Vision WASM. */
const MEDIAPIPE_VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

/** 블렌드셰이프 이름 인덱스 빌드용. */
const BS = {
  eyeBlinkLeft: "eyeBlinkLeft",
  eyeBlinkRight: "eyeBlinkRight",
  jawOpen: "jawOpen",
  mouthSmileLeft: "mouthSmileLeft",
  mouthSmileRight: "mouthSmileRight",
  browInnerUp: "browInnerUp",
  browOuterUpLeft: "browOuterUpLeft",
  browOuterUpRight: "browOuterUpRight",
  eyeLookInLeft: "eyeLookInLeft",
  eyeLookOutLeft: "eyeLookOutLeft",
  eyeLookInRight: "eyeLookInRight",
  eyeLookOutRight: "eyeLookOutRight",
  eyeLookUpLeft: "eyeLookUpLeft",
  eyeLookDownLeft: "eyeLookDownLeft",
  eyeLookUpRight: "eyeLookUpRight",
  eyeLookDownRight: "eyeLookDownRight",
} as const;

/* ── Singleton FaceLandmarker ─────────────────────────────────────────── */

let cachedLandmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

/**
 * MediaPipe FaceLandmarker를 lazy 초기화(싱글턴).
 * 두 번째 호출부터는 캐시된 인스턴스를 즉시 반환한다.
 */
export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (cachedLandmarker) return cachedLandmarker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import — 번들 초기 로드를 줄이기 위해 런타임에만 불러온다.
    const { FilesetResolver, FaceLandmarker: FLM } = await import(
      "@mediapipe/tasks-vision"
    );

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_CDN);

    // Try GPU first, fallback to CPU (some GPUs / environments fail on GPU delegate)
    let landmarker: FaceLandmarker;
    try {
      landmarker = await FLM.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        numFaces: 1,
      });
    } catch (gpuErr) {
      console.warn("FaceLandmarker GPU delegate failed, falling back to CPU:", gpuErr);
      landmarker = await FLM.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        numFaces: 1,
      });
    }

    cachedLandmarker = landmarker;
    return landmarker;
  })();

  try {
    return await initPromise;
  } catch (error) {
    // 실패 시 재시도 가능하도록 프라미스 캐시를 정리한다.
    initPromise = null;
    throw error;
  }
}

/** 캐시된 FaceLandmarker를 해제(메모리 반환). */
export function disposeFaceLandmarker(): void {
  if (cachedLandmarker) {
    cachedLandmarker.close();
    cachedLandmarker = null;
  }
  initPromise = null;
}

let cachedPoseLandmarker: PoseLandmarker | null = null;
let initPosePromise: Promise<PoseLandmarker> | null = null;

/**
 * MediaPipe PoseLandmarker를 lazy 초기화(싱글턴).
 */
export async function initPoseLandmarker(): Promise<PoseLandmarker> {
  if (cachedPoseLandmarker) return cachedPoseLandmarker;
  if (initPosePromise) return initPosePromise;

  initPosePromise = (async () => {
    const { FilesetResolver, PoseLandmarker: PLM } = await import(
      "@mediapipe/tasks-vision"
    );
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_CDN);

    let landmarker: PoseLandmarker;
    try {
      landmarker = await PLM.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputSegmentationMasks: false,
      });
    } catch (err) {
      console.warn("PoseLandmarker GPU delegate failed, falling back to CPU:", err);
      landmarker = await PLM.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputSegmentationMasks: false,
      });
    }

    cachedPoseLandmarker = landmarker;
    return landmarker;
  })();

  try {
    return await initPosePromise;
  } catch (error) {
    initPosePromise = null;
    throw error;
  }
}

/** 캐시된 PoseLandmarker를 해제(메모리 반환). */
export function disposePoseLandmarker(): void {
  if (cachedPoseLandmarker) {
    cachedPoseLandmarker.close();
    cachedPoseLandmarker = null;
  }
  initPosePromise = null;
}

let cachedHandLandmarker: HandLandmarker | null = null;
let initHandPromise: Promise<HandLandmarker> | null = null;

/** MediaPipe HandLandmarker를 lazy 초기화(싱글턴, 양손). */
export async function initHandLandmarker(): Promise<HandLandmarker> {
  if (cachedHandLandmarker) return cachedHandLandmarker;
  if (initHandPromise) return initHandPromise;

  initHandPromise = (async () => {
    const { FilesetResolver, HandLandmarker: HLM } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_CDN);
    const model =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

    let landmarker: HandLandmarker;
    try {
      landmarker = await HLM.createFromOptions(vision, {
        baseOptions: { modelAssetPath: model, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } catch (err) {
      console.warn("HandLandmarker GPU delegate failed, falling back to CPU:", err);
      landmarker = await HLM.createFromOptions(vision, {
        baseOptions: { modelAssetPath: model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    }

    cachedHandLandmarker = landmarker;
    return landmarker;
  })();

  try {
    return await initHandPromise;
  } catch (error) {
    initHandPromise = null;
    throw error;
  }
}

/** 캐시된 HandLandmarker를 해제(메모리 반환). */
export function disposeHandLandmarker(): void {
  if (cachedHandLandmarker) {
    cachedHandLandmarker.close();
    cachedHandLandmarker = null;
  }
  initHandPromise = null;
}

/* ── Blendshape extraction helpers ────────────────────────────────────── */

type BlendshapeMap = Map<string, number>;

/**
 * FaceLandmarkerResult.faceBlendshapes[0].categories → Map<이름, 점수>로 변환.
 * 없으면 null 반환.
 */
function buildBlendshapeMap(
  result: FaceLandmarkerResult,
): BlendshapeMap | null {
  const shapes = result.faceBlendshapes;
  if (!shapes || shapes.length === 0) return null;

  const categories = shapes[0].categories;
  if (!categories || categories.length === 0) return null;

  const map: BlendshapeMap = new Map();
  for (const cat of categories) {
    map.set(cat.categoryName, cat.score);
  }
  return map;
}

function bs(map: BlendshapeMap, name: string): number {
  return map.get(name) ?? 0;
}

/* ── Head rotation from 4×4 transformation matrix ─────────────────────── */

/**
 * 4×4 열-우선(column-major) 또는 행-우선(row-major) 변환 행렬에서
 * Euler 각(pitch, yaw, roll)을 추출한다.
 *
 * MediaPipe FacialTransformationMatrix는 행-우선 4×4 flat array로 주어지며,
 * 회전 부분(상위 3×3)의 row-major 레이아웃:
 *   m[0] m[1] m[2]   R00 R01 R02
 *   m[4] m[5] m[6]   R10 R11 R12
 *   m[8] m[9] m[10]  R20 R21 R22
 *
 * Euler 분해(XYZ intrinsic = ZYX extrinsic):
 *   pitch = atan2(-R21, R22) = atan2(-m[9], m[10])
 *   yaw   = asin(R20)       = asin(m[8])
 *   roll  = atan2(-R10, R00) = atan2(-m[4], m[0])
 */
function eulerFromMatrix(m: ArrayLike<number>): readonly [number, number, number] {
  // Clamp asin argument to [-1, 1] for numerical safety
  const sinYaw = Math.max(-1, Math.min(1, m[8]));
  const yaw = Math.asin(sinYaw);

  const cosYaw = Math.cos(yaw);

  let pitch: number;
  let roll: number;

  if (Math.abs(cosYaw) > 1e-6) {
    pitch = Math.atan2(-m[9], m[10]);
    roll = Math.atan2(-m[4], m[0]);
  } else {
    // Gimbal lock 근처 — yaw ≈ ±90°
    pitch = Math.atan2(m[6], m[5]);
    roll = 0;
  }

  return [pitch, yaw, roll] as const;
}

/* ── processTrackingResult ────────────────────────────────────────────── */

/**
 * FaceLandmarkerResult에서 TrackingChannels를 추출한다.
 * 얼굴이 감지되지 않으면 null.
 */
export function processTrackingResult(
  result: FaceLandmarkerResult,
): TrackingChannels | null {
  const bsMap = buildBlendshapeMap(result);
  if (!bsMap) return null;

  // — Head rotation from transformation matrix —
  let headPitch = 0;
  let headYaw = 0;
  let headRoll = 0;

  const matrices = result.facialTransformationMatrixes;
  if (matrices && matrices.length > 0) {
    const matrixData = matrices[0].data;
    if (matrixData && matrixData.length >= 12) {
      [headPitch, headYaw, headRoll] = eulerFromMatrix(matrixData);
    }
  }

  // — Eye blink —
  const blinkLeft = bs(bsMap, BS.eyeBlinkLeft);
  const blinkRight = bs(bsMap, BS.eyeBlinkRight);

  // — Mouth —
  const mouthOpen = bs(bsMap, BS.jawOpen);
  const smileL = bs(bsMap, BS.mouthSmileLeft);
  const smileR = bs(bsMap, BS.mouthSmileRight);
  const mouthSmile = (smileL + smileR) * 0.5;

  // — Brow —
  const browInnerUp = bs(bsMap, BS.browInnerUp);
  const browOuterUpLeft = bs(bsMap, BS.browOuterUpLeft);
  const browOuterUpRight = bs(bsMap, BS.browOuterUpRight);

  // — Gaze —
  // gazeX: positive = looking right from camera's perspective
  // eyeLookInLeft = left eye looking inward (toward nose) = looking right
  // eyeLookOutLeft = left eye looking outward = looking left
  // Average both eyes for stability.
  const lookInL = bs(bsMap, BS.eyeLookInLeft);
  const lookOutL = bs(bsMap, BS.eyeLookOutLeft);
  const lookInR = bs(bsMap, BS.eyeLookInRight);
  const lookOutR = bs(bsMap, BS.eyeLookOutRight);
  // In = toward nose, Out = away from nose
  // Left eye: In → right, Out → left  |  Right eye: In → left, Out → right
  const gazeXLeft = lookInL - lookOutL;    // positive = looking right
  const gazeXRight = lookOutR - lookInR;   // positive = looking right
  const gazeX = clamp01Signed((gazeXLeft + gazeXRight) * 0.5);

  const lookUpL = bs(bsMap, BS.eyeLookUpLeft);
  const lookDownL = bs(bsMap, BS.eyeLookDownLeft);
  const lookUpR = bs(bsMap, BS.eyeLookUpRight);
  const lookDownR = bs(bsMap, BS.eyeLookDownRight);
  const gazeYLeft = lookUpL - lookDownL;   // positive = looking up
  const gazeYRight = lookUpR - lookDownR;  // positive = looking up
  const gazeY = clamp01Signed((gazeYLeft + gazeYRight) * 0.5);

  return {
    headPitch,
    headYaw,
    headRoll,
    blinkLeft,
    blinkRight,
    gazeX,
    gazeY,
    mouthOpen,
    mouthSmile,
    browInnerUp,
    browOuterUpLeft,
    browOuterUpRight,
  };
}

/* ── Smoothing ────────────────────────────────────────────────────────── */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 이전 채널 → 다음 채널을 EMA(지수이동평균)로 보간한다.
 * prev가 null이면(첫 프레임) next를 그대로 반환한다.
 *
 * @param alpha 0 < alpha ≤ 1. 작을수록 부드럽고 지연이 크며, 1이면 즉시 반영.
 */
export function smoothRawChannels(
  prev: TrackingChannels | null,
  next: TrackingChannels,
  alpha: number,
): TrackingChannels {
  if (!prev) return { ...next };

  const a = Math.max(0, Math.min(1, alpha));

  return {
    headPitch: lerp(prev.headPitch, next.headPitch, a),
    headYaw: lerp(prev.headYaw, next.headYaw, a),
    headRoll: lerp(prev.headRoll, next.headRoll, a),
    blinkLeft: lerp(prev.blinkLeft, next.blinkLeft, a),
    blinkRight: lerp(prev.blinkRight, next.blinkRight, a),
    gazeX: lerp(prev.gazeX, next.gazeX, a),
    gazeY: lerp(prev.gazeY, next.gazeY, a),
    mouthOpen: lerp(prev.mouthOpen, next.mouthOpen, a),
    mouthSmile: lerp(prev.mouthSmile, next.mouthSmile, a),
    browInnerUp: lerp(prev.browInnerUp, next.browInnerUp, a),
    browOuterUpLeft: lerp(prev.browOuterUpLeft, next.browOuterUpLeft, a),
    browOuterUpRight: lerp(prev.browOuterUpRight, next.browOuterUpRight, a),
  };
}

/* ── Convert channels → VRM data ──────────────────────────────────────── */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp01Signed(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

/**
 * TrackingChannels를 VRM 뼈 회전 + 표정 가중치로 변환한다.
 *
 * 뼈(bones):
 *   - "head"  → [pitch, yaw, roll]   (sensitivity 반영)
 *   - "neck"  → head 회전의 30% 분담 (자연스러운 목 연동)
 *
 * 표정(expressions): VRM 1.0 표준 이름
 *   - blinkLeft, blinkRight, aa(입 벌림), happy(미소),
 *     lookUp/lookDown/lookLeft/lookRight(시선),
 *     browInnerUp, browOuterUpLeft, browOuterUpRight
 *
 * options.gazeLock → 시선 채널을 0으로 고정.
 * options.mirrorMode → yaw, roll, gazeX, 좌우 눈 채널을 반전.
 */
export function convertChannelsToVrmData(
  channels: TrackingChannels,
  options: TrackingOptions,
): VrmTrackingData {
  const { gazeLock, mirrorMode, sensitivity } = options;
  const s = Math.max(0, sensitivity);

  // — Mirror handling —
  const mirrorSign = mirrorMode ? -1 : 1;

  const pitch = channels.headPitch * s;
  const yaw = channels.headYaw * s * mirrorSign;
  const roll = channels.headRoll * s * mirrorSign;

  // Neck takes 30% of the head rotation for a natural look
  const NECK_SHARE = 0.3;
  const HEAD_SHARE = 1 - NECK_SHARE;

  // 본은 three.js 기본 XYZ Euler 로 적용된다: rot[0]=X(끄덕임/pitch), rot[1]=Y(yaw), rot[2]=Z(roll).
  // eulerFromMatrix 는 항공식(ZYX) 분해라 두 규약은 작은 머리 각도에서만 근사 일치한다(실사용 OK).
  // 미러(거울) 규약은 [pitch, -yaw, -roll] = [x,-y,-z] 로, 바디 솔버·수동 포즈 미러와 동일하다.
  const bones: Record<string, readonly [number, number, number]> = {
    head: [pitch * HEAD_SHARE, yaw * HEAD_SHARE, roll * HEAD_SHARE] as const,
    neck: [pitch * NECK_SHARE, yaw * NECK_SHARE, roll * NECK_SHARE] as const,
  };

  // — Blinks (mirror swaps left/right) —
  const blinkL = mirrorMode ? channels.blinkRight : channels.blinkLeft;
  const blinkR = mirrorMode ? channels.blinkLeft : channels.blinkRight;

  // — Gaze —
  let gazeX = gazeLock ? 0 : channels.gazeX * s * mirrorSign;
  let gazeY = gazeLock ? 0 : channels.gazeY * s;
  gazeX = clamp01Signed(gazeX);
  gazeY = clamp01Signed(gazeY);

  // VRM uses lookLeft/lookRight/lookUp/lookDown (all 0-1)
  const lookLeft = clamp01(gazeX < 0 ? -gazeX : 0);
  const lookRight = clamp01(gazeX > 0 ? gazeX : 0);
  const lookUp = clamp01(gazeY > 0 ? gazeY : 0);
  const lookDown = clamp01(gazeY < 0 ? -gazeY : 0);

  // — Brows (mirror swaps outer left/right) —
  const browOuterL = mirrorMode
    ? channels.browOuterUpRight
    : channels.browOuterUpLeft;
  const browOuterR = mirrorMode
    ? channels.browOuterUpLeft
    : channels.browOuterUpRight;

  // — Mouth —
  const mouthOpen = clamp01(channels.mouthOpen * s);
  const mouthSmile = clamp01(channels.mouthSmile * s);

  const expressions: Record<string, number> = {
    blinkLeft: clamp01(blinkL),
    blinkRight: clamp01(blinkR),
    aa: mouthOpen,
    happy: mouthSmile,
    lookUp,
    lookDown,
    lookLeft,
    lookRight,
    browInnerUp: clamp01(channels.browInnerUp * s),
    browOuterUpLeft: clamp01(browOuterL * s),
    browOuterUpRight: clamp01(browOuterR * s),
  };

  return { bones, expressions };
}

/**
 * PoseLandmarkerResult에서 팔/다리/발의 **부모상대** 본 회전(Euler)을 추출한다.
 * 실제 계산은 studio-vrm-pose-solver 에 위임한다(부모상대 회전으로 팔꿈치/무릎 이중회전
 * 버그 수정 + 단일 카메라 z 감쇠 + 가시성 게이팅). 호출부 계약(본 이름→[x,y,z])은 동일.
 */
export function processPoseResult(
  result: PoseLandmarkerResult,
  mirrorMode = true
): Record<string, readonly [number, number, number]> {
  const landmarks = result?.worldLandmarks?.[0];
  return solvePoseToVrmBones(landmarks, { mirror: mirrorMode });
}
