import type { StudioAiImageSize } from "./studio-ai-client";
import type { GeneratedAssetQuality, GeneratedAssetSize } from "@/platform/creator-client";

/** Build the BYOK request without adding provider policy to the editor host. */
export function buildStudioAiAssetImageRequest(
  prompt: string,
  size: GeneratedAssetSize,
  quality: GeneratedAssetQuality,
): { readonly prompt: string; readonly size: StudioAiImageSize } {
  const imageSize: StudioAiImageSize = size === "1536x1024"
    ? "1792x1024"
    : size === "1024x1536" ? "1024x1792" : size;
  const qualityDirection = quality === "low"
    ? "Create a fast preview with a clean silhouette and restrained detail."
    : quality === "high"
      ? "Create production-ready detail with crisp edges and coherent lighting."
      : quality === "medium"
        ? "Balance production detail, clarity, and generation speed."
        : "Choose detail appropriate for a reusable webtoon asset.";
  return {
    size: imageSize,
    prompt: `${prompt}

${qualityDirection}
No text, logo, watermark, or copyrighted character.`,
  };
}
