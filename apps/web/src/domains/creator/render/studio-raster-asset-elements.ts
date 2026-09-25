import type { StudioRasterAsset } from "./studio-raster-assets";
import type { El, ImageEl, TextEl } from "../studio-element-model";

/** 장식 그림과 대사를 분리해 한 번의 문서 변경으로 추가한다. */
export function buildStudioRasterAssetElements(
  asset: StudioRasterAsset,
  image: ImageEl,
  createId: () => string,
): readonly El[] {
  const artwork: Extract<El, { type: "image" }> = {
    ...image,
    name: asset.label,
    opacity: asset.defaultOpacity,
    blendMode: asset.defaultBlendMode === "source-over" ? "normal" : asset.defaultBlendMode,
    builtinRasterAssetId: asset.id,
    aiProvenance: {
      action: "generated",
      provider: asset.provenance.provider,
      model: asset.provenance.model,
      transport: "server",
      promptVersion: 1,
      createdAt: `${asset.provenance.generatedOn}T00:00:00.000Z`,
    },
  };
  if (asset.kind !== "bubble-decoration") return [artwork];
  const dialogue: TextEl = {
    id: createId(),
    type: "text",
    text: "대사를 입력하세요",
    x: image.x + image.width * 0.22,
    y: image.y + image.height * 0.4,
    width: image.width * 0.56,
    fontSize: Math.max(16, Math.min(36, image.width * 0.045)),
    fill: "#20212b",
    rotation: image.rotation,
    align: "center",
  };
  return [artwork, dialogue];
}
