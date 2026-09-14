import { studioCc0AssetUrl } from "./studio-cc0-asset-delivery";
import { findStudioMarketplaceCc0Asset, resolveStudioMarketplaceCc0Model } from "./studio-marketplace-cc0-registry";
import { createStudioOriginalFreeAssetRecord, findStudioOriginalFreeAsset } from "./studio-original-free-asset-packs";

export interface StudioMarketplaceAssetPreview {
  readonly src: string;
  readonly name: string;
  readonly caption: string;
}

export function resolveStudioMarketplaceAssetPreview(runtimeRef: string): StudioMarketplaceAssetPreview | null {
  const model = resolveStudioMarketplaceCc0Model(runtimeRef);
  if (model?.previewPath) return {
    src: studioCc0AssetUrl(model.previewPath), name: model.name,
    caption: "해당 GLB의 렌더 미리보기입니다. 실제 회전·확대와 모델 배치는 Studio에서 확인하세요.",
  };
  const id = runtimeRef.startsWith("studio-asset:") ? runtimeRef.slice("studio-asset:".length) : runtimeRef;
  const original = findStudioOriginalFreeAsset(id);
  if (original) return {
    src: createStudioOriginalFreeAssetRecord(original).dataUrl, name: original.name,
    caption: "Studio에 삽입되는 실제 SVG 원본입니다.",
  };
  const cc0 = findStudioMarketplaceCc0Asset(id);
  return cc0 && cc0.kind !== "model" ? {
    src: studioCc0AssetUrl(cc0.path), name: cc0.name,
    caption: `${cc0.width}×${cc0.height}px 실제 원본 · ${cc0.provider} · CC0`,
  } : null;
}
