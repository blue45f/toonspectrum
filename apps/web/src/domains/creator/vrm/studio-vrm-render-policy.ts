import type { StudioVrmQualityTier } from "./studio-vrm-gpu-capability";

export type StudioVrmFrameLoop = "always" | "demand";

export interface StudioVrmRenderActivity {
  readonly webcamActive: boolean;
  readonly idleAnimation: boolean;
  readonly physicsPreview: boolean;
  readonly turntable: boolean;
  readonly viewportHandIkDragging: boolean;
  readonly jointHandleInteracting: boolean;
  readonly persistentIkReconciling: boolean;
  readonly capturing: boolean;
  readonly sharingPose: boolean;
  readonly thumbnailCapturing: boolean;
}

/**
 * Keeps a static posing scene event-driven. React Three Fiber invalidates demand frames for scene,
 * camera and control changes; only genuinely time-varying work needs an uninterrupted GPU loop.
 */
export function resolveStudioVrmFrameLoop(
  activity: StudioVrmRenderActivity,
): StudioVrmFrameLoop {
  return Object.values(activity).some(Boolean) ? "always" : "demand";
}

export interface StudioVrmDisplayBudget {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
  readonly coarse: boolean;
  /**
   * GPU 품질 등급. 생략하면 standard.
   * low(소프트웨어 렌더링·극저사양)는 픽셀 예산과 DPR 상한을 낮춰 프레임 시간을 지킨다.
   */
  readonly tier?: StudioVrmQualityTier;
}

/** 표시용 GPU 예산이다. PNG·PSD의 명시적인 출력 해상도는 변경하지 않는다. */
export function resolveStudioVrmDisplayDpr(input: StudioVrmDisplayBudget): number {
  const { width, height, devicePixelRatio, coarse } = input;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const deviceDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const low = input.tier === "low";
  const pixelBudget = low ? (coarse ? 700_000 : 900_000) : coarse ? 1_500_000 : 4_000_000;
  const dprCap = low ? (coarse ? 1 : 1.25) : coarse ? 1.5 : 2;
  // 곱셈 오버플로와 제곱의 언더플로 없이 실제 픽셀 예산을 지킨다.
  const budgetDpr = Math.sqrt(pixelBudget) / Math.sqrt(width) / Math.sqrt(height);
  return Math.min(deviceDpr, dprCap, budgetDpr);
}
