// AI 이미지 에셋 생성 — OpenAI 이미지 API 프록시와 프롬프트/사이즈 정규화.
import { clampText, normalizeMultiline } from "./shared";
import { MAX_ASSET_NAME } from "./shared-assets";

const IMAGE_ASSET_MODELS = {
  fast: "gpt-image-2.5-flare",
  precision: "gpt-image-2.5-sunburst",
} as const;
const IMAGE_ASSET_ENDPOINT = "https://api.openai.com/v1/images/generations";
const MAX_IMAGE_ASSET_PROMPT = 8_000;
const IMAGE_ASSET_SIZES = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
  "2048x2048": { width: 2048, height: 2048 },
  "2048x1152": { width: 2048, height: 1152 },
  "1152x2048": { width: 1152, height: 2048 },
} as const;
const IMAGE_ASSET_QUALITIES = new Set(["low", "medium", "high", "xhigh", "max", "auto"]);

export type ImageAssetSize = keyof typeof IMAGE_ASSET_SIZES;
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

function parseImageAssetSize(value: unknown): ImageAssetSize {
  const key = String(value ?? "");
  return Object.prototype.hasOwnProperty.call(IMAGE_ASSET_SIZES, key) ? (key as ImageAssetSize) : "1024x1024";
}

function parseImageAssetQuality(value: unknown): ImageAssetQuality {
  const key = String(value ?? "");
  return IMAGE_ASSET_QUALITIES.has(key) ? (key as ImageAssetQuality) : "medium";
}

/** Default to the low-latency model; reserve precision generation for an explicit MAX request. */
export function imageAssetModelForQuality(quality: ImageAssetQuality): ImageAssetModel {
  return quality === "max" ? IMAGE_ASSET_MODELS.precision : IMAGE_ASSET_MODELS.fast;
}

function imageAssetTimeoutMs(model: ImageAssetModel, quality: ImageAssetQuality): number {
  if (model === IMAGE_ASSET_MODELS.precision || quality === "max") return 300_000;
  if (quality === "xhigh") return 180_000;
  return 120_000;
}

function assetNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0] ?? "";
  return clampText(firstLine.replace(/[^\p{L}\p{N}\s._-]/gu, " "), MAX_ASSET_NAME) || "AI 에셋";
}

function buildImageAssetPrompt(userPrompt: string): string {
  return [
    "Create a reusable image asset for a Korean webtoon and comic creation canvas.",
    `User request: ${userPrompt}`,
    "Style: polished webtoon illustration, clean readable silhouette, crisp edges, coherent lighting, production-ready detail.",
    "If the user asks for a background scene, create a full-panel background. Otherwise create a single reusable prop, character, effect, or object asset with generous padding.",
    "Preserve a clear focal hierarchy and avoid accidental crops at the canvas edge.",
    "Constraints: no text, no captions, no logos, no watermark, no UI screenshot, no copyrighted characters, no real-person likeness.",
  ].join("\n");
}

function openAiImageErrorMessage(status: number, payload: unknown): string {
  const error = payload && typeof payload === "object" ? (payload as { error?: { code?: string; message?: string } }).error : undefined;
  if (error?.code === "moderation_blocked") return "요청이 안전 정책에 의해 차단되었습니다. 프롬프트를 조정해 주세요.";
  if (error?.code === "model_not_found" || status === 404) return "선택한 OpenAI 이미지 모델을 사용할 수 없습니다. 모델 접근 권한과 설정을 확인해 주세요.";
  if (status === 401) return "OpenAI API 키를 확인해 주세요.";
  if (status === 429) return "OpenAI 이미지 생성 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "OpenAI 이미지 생성 서버가 일시적으로 응답하지 않습니다.";
  return error?.message || "이미지를 생성하지 못했습니다.";
}

export async function generateImageAsset(
  input: { prompt?: unknown; name?: unknown; size?: unknown; quality?: unknown }
): Promise<GeneratedCreatorAsset> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const userPrompt = normalizeMultiline(input.prompt, MAX_IMAGE_ASSET_PROMPT);
  if (userPrompt.length < 3) throw new Error("생성할 에셋 설명을 입력해 주세요.");

  const size = parseImageAssetSize(input.size);
  const quality = parseImageAssetQuality(input.quality);
  const model = imageAssetModelForQuality(quality);
  const dims = IMAGE_ASSET_SIZES[size];
  const name = clampText(input.name, MAX_ASSET_NAME) || assetNameFromPrompt(userPrompt);

  const response = await fetch(IMAGE_ASSET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: buildImageAssetPrompt(userPrompt),
      n: 1,
      size,
      quality,
      background: "auto",
      output_format: "webp",
      output_compression: quality === "max" || quality === "xhigh" ? 92 : 84,
    }),
    signal: AbortSignal.timeout(imageAssetTimeoutMs(model, quality)),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(openAiImageErrorMessage(response.status, payload));

  const b64 = payload && typeof payload === "object" ? (payload as { data?: Array<{ b64_json?: unknown }> }).data?.[0]?.b64_json : undefined;
  if (typeof b64 !== "string" || b64.length === 0) throw new Error("OpenAI 이미지 응답이 비어 있습니다.");

  return {
    name,
    dataUrl: `data:image/webp;base64,${b64}`,
    width: dims.width,
    height: dims.height,
    model,
    size,
    quality,
  };
}
