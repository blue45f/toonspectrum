/**
 * 비전 포트 타입(순수). 브라우저 로더(mediapipe-loader.browser.ts)가 구현하고 세션·패널·테스트는 이 모양만 본다.
 * 계약 `VisionStatus`는 imageEmbedder·poseLandmarker 두 모델만 알므로, 손 모델(handLandmarker)은
 * 이 모듈의 `VisionModelStatus`로 따로 추적한다(계약 변경 요청: MEDIAPIPE_MODELS에 handLandmarker 추가).
 */
import type { EmbedderPort, LabFailure, PoseLandmark, VisionModelId, VisionStatus } from "../../contracts";

export type VisionModelKey = VisionModelId | "handLandmarker";
export const VISION_MODEL_KEYS: readonly VisionModelKey[] = ["imageEmbedder", "poseLandmarker", "handLandmarker"];

export const VISION_MODEL_LABELS_KO: Readonly<Record<VisionModelKey, string>> = {
  imageEmbedder: "이미지 임베더(MobileNet V3 small)",
  poseLandmarker: "포즈 랜드마커(lite)",
  handLandmarker: "손 랜드마커",
};

export type VisionDelegate = "CPU" | "GPU";

/** 브라우저 이미지 입력(ImageBitmap 또는 ImageData) */
export type VisionImageSource = ImageBitmap | ImageData;

export interface PoseDetection {
  /** 정규화 좌표 33점(0..1, 이미지 비율 미보정) */
  readonly landmarks: readonly PoseLandmark[];
  /** 월드 좌표 33점(m, 엉덩이 중심 원점). 모델이 주지 않으면 null. */
  readonly worldLandmarks: readonly PoseLandmark[] | null;
}

export interface HandDetection {
  /** 모델이 보고한 손(셀피 가정: "Left"/"Right") */
  readonly reportedHandedness: "Left" | "Right" | "Unknown";
  readonly score: number;
  readonly landmarks: readonly PoseLandmark[];
  readonly worldLandmarks: readonly PoseLandmark[] | null;
}

export interface PoseDetectorPort {
  /** 사람이 검출되지 않으면 null */
  detect(image: VisionImageSource): Promise<PoseDetection | null>;
}

export interface HandDetectorPort {
  /** 검출된 손(0..2개) */
  detect(image: VisionImageSource): Promise<readonly HandDetection[]>;
}

export interface LoadedModel<Port> {
  readonly key: VisionModelKey;
  readonly port: Port;
  /** 받은 모델 바이트의 SHA-256(항상 계산) */
  readonly observedSha256: string;
  /** 계약에 SHA가 고정돼 있어 검증까지 통과했는지 */
  readonly pinned: boolean;
  readonly bytes: number;
  readonly license: string;
  readonly delegate: VisionDelegate;
  dispose(): void;
}

export interface VisionLoaders {
  imageEmbedder(): Promise<LoadedModel<EmbedderPort>>;
  poseLandmarker(): Promise<LoadedModel<PoseDetectorPort>>;
  handLandmarker(): Promise<LoadedModel<HandDetectorPort>>;
}

export type VisionModelStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "loading"; readonly model: VisionModelKey }
  | { readonly phase: "ready"; readonly model: VisionModelKey; readonly observedSha256: string; readonly pinned: boolean; readonly delegate: VisionDelegate }
  | { readonly phase: "failed"; readonly model: VisionModelKey; readonly failure: LabFailure };

/** 계약 VisionStatus로 변환. 손 모델은 계약 밖이므로 null. */
export function toContractVisionStatus(status: VisionModelStatus): VisionStatus | null {
  if (status.phase === "idle") return { phase: "idle" };
  if (status.model === "handLandmarker") return null;
  if (status.phase === "loading") return { phase: "loading", model: status.model };
  if (status.phase === "ready") return { phase: "ready", model: status.model, observedSha256: status.observedSha256 };
  return { phase: "failed", failure: status.failure };
}

/**
 * MediaPipe 손 방향 보고는 "셀피(좌우 반전) 이미지" 가정이다. 일반 사진(selfie=false)이면 뒤집어 해석한다.
 * Unknown은 null(사용자가 직접 고른다).
 */
export function resolveHandSide(reported: HandDetection["reportedHandedness"], options: { readonly selfie: boolean }): "left" | "right" | null {
  if (reported === "Unknown") return null;
  const asReported = reported === "Left" ? "left" : "right";
  if (options.selfie) return asReported;
  return asReported === "left" ? "right" : "left";
}
