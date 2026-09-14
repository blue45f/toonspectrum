import { ServiceUnavailableException } from "@nestjs/common";

const IMAGE_ASSET_MODELS = {
  fast: "gpt-image-2.5-flare",
  precision: "gpt-image-2.5-sunburst",
} as const;


export type ImageAssetSize =
  | "1024x1024"
  | "1536x1024"
  | "1024x1536"
  | "2048x2048"
  | "2048x1152"
  | "1152x2048";
export type ImageAssetQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";
export type ImageAssetModel = (typeof IMAGE_ASSET_MODELS)[keyof typeof IMAGE_ASSET_MODELS];

export interface GeneratedCreatorAsset {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  model: ImageAssetModel;
  size: ImageAssetSize;
  quality: ImageAssetQuality;
}

/**
 * Model selection remains a pure compatibility helper for historical manifests and tests.
 * The application no longer invokes either model with an operator-owned key.
 */
export function imageAssetModelForQuality(quality: ImageAssetQuality): ImageAssetModel {
  return quality === "max" ? IMAGE_ASSET_MODELS.precision : IMAGE_ASSET_MODELS.fast;
}

/**
 * Paid image generation is browser-to-provider BYOK through Studio's unified AI settings.
 * This legacy server entry stays fail-closed so stale clients can never spend an operator key.
 */
export async function generateImageAsset(
  _input: { prompt?: unknown; name?: unknown; size?: unknown; quality?: unknown },
): Promise<GeneratedCreatorAsset> {
  throw new ServiceUnavailableException({
    code: "USER_AI_CONNECTION_REQUIRED",
    message: "운영측 이미지 생성은 비활성화되어 있습니다. 통합 AI 설정에서 본인 이미지 API 키를 연결하세요.",
    settingsHref: "/studio/ai-settings",
    operatorFunded: false,
  });
}
