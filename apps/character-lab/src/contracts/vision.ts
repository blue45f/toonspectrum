/**
 * 비전 계약: 참고 이미지 임베딩(추천)·사진 포즈 랜드마크. 모델은 온디바이스(MediaPipe).
 * pose 모델 SHA는 첫 브라우저 검증 전까지 미고정(베타)이며 HUD에 그 사실을 표시한다.
 */
import type { PoseScope } from "./bones";
import type { LabFailure } from "./errors";

export type Embedding = Float32Array;

export interface EmbedderPort {
  embed(image: ImageBitmap | ImageData): Promise<Embedding>;
}

/** MediaPipe Pose Landmarker 33점 이름(인덱스 순) */
export const POSE_LANDMARK_NAMES = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
] as const;

export type PoseLandmarkName = (typeof POSE_LANDMARK_NAMES)[number];
export const POSE_LANDMARK_COUNT = 33;

/** MediaPipe Hand Landmarker 21점 이름(인덱스 순) */
export const HAND_LANDMARK_NAMES = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_finger_mcp",
  "index_finger_pip",
  "index_finger_dip",
  "index_finger_tip",
  "middle_finger_mcp",
  "middle_finger_pip",
  "middle_finger_dip",
  "middle_finger_tip",
  "ring_finger_mcp",
  "ring_finger_pip",
  "ring_finger_dip",
  "ring_finger_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
] as const;

export type HandLandmarkName = (typeof HAND_LANDMARK_NAMES)[number];
export const HAND_LANDMARK_COUNT = 21;

export interface PoseLandmark {
  /** 이미지 정규화 좌표 0..1(월드 랜드마크는 m) */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 0..1 */
  readonly visibility: number;
}

export function landmarkIndex(name: PoseLandmarkName): number {
  return POSE_LANDMARK_NAMES.indexOf(name);
}

export type LandmarkApplyScope = Extract<PoseScope, "full" | "upper" | "arms-hands">;
export const LANDMARK_APPLY_SCOPES: readonly LandmarkApplyScope[] = ["full", "upper", "arms-hands"];

/** 가시성이 이 값 미만인 랜드마크는 적용하지 않는다. */
export const LANDMARK_VISIBILITY_MIN = 0.5;

export type VisionStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "loading"; readonly model: VisionModelId }
  | { readonly phase: "ready"; readonly model: VisionModelId; readonly observedSha256?: string }
  | { readonly phase: "failed"; readonly failure: LabFailure };

export type VisionModelId = keyof typeof MEDIAPIPE_MODELS;

export const VISION_LOAD_TIMEOUT_MS = 15_000;

export const MEDIAPIPE_MODELS = {
  imageEmbedder: {
    url: "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite",
    bytes: 4_117_670,
    sha256: "bbbb4c51a55a53905af1daec995ca1aae355046f8839bb8c9f5ce9271394bc40",
    license: "Apache-2.0",
  },
  /** bytes·sha256은 첫 브라우저 검증 시 통합 담당이 고정한다(그 전까지 '미고정·베타'). */
  poseLandmarker: {
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    bytes: null,
    sha256: null,
    license: "Apache-2.0",
  },
  /** 손 21점 랜드마커(손가락 포즈 적용용). pose와 같은 이유로 bytes·sha256은 첫 브라우저 검증 시 고정한다('미고정·베타'). */
  handLandmarker: {
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    bytes: null,
    sha256: null,
    license: "Apache-2.0",
  },
} as const;

/** 모델 SHA가 고정되어 있는지(미고정이면 UI에 베타 배지) */
export function isModelPinned(model: VisionModelId): boolean {
  return MEDIAPIPE_MODELS[model].sha256 !== null;
}
