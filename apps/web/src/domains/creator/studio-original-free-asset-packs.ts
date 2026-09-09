import {
  STUDIO_ORIGINAL_FREE_ASSET_PACKAGES as BASE_PACKAGES,
  STUDIO_ORIGINAL_FREE_ASSETS as BASE_ASSETS,
  findStudioOriginalFreeAsset as findBaseAsset,
  findStudioOriginalFreeAssetPackage as findBasePackage,
  type StudioOriginalFreeAsset,
  type StudioOriginalFreeAssetCategory,
  type StudioOriginalFreeAssetPackage,
} from "./studio-original-free-asset-packs-base";
import {
  STUDIO_ORIGINAL_2D_EXPANSION_ASSETS,
  STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES,
  findStudioOriginal2dExpansionPackage,
} from "./catalog/studio-original-2d-asset-expansion";

export {
  STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  STUDIO_RETIRED_ORIGINAL_FREE_ASSETS,
  createStudioOriginalFreeAssetRecord,
  encodeStudioOriginalAssetSvg,
  type StudioOriginalFreeAsset,
  type StudioOriginalFreeAssetCategory,
  type StudioOriginalFreeAssetPackage,
} from "./studio-original-free-asset-packs-base";

/**
 * Canonical authored 2D catalog.
 *
 * The original starter collection is preserved byte-for-byte in the base module while
 * newer webtoon-focused packs are layered here. Existing consumers keep importing this
 * path, so Studio insertion, drag/drop, marketplace previews and package installation all
 * see the same catalog without duplicating integration code.
 */
export const STUDIO_ORIGINAL_FREE_ASSET_PACKAGES: readonly StudioOriginalFreeAssetPackage[] =
  Object.freeze([
    ...BASE_PACKAGES,
    ...STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES,
  ]);

export const STUDIO_ORIGINAL_FREE_ASSETS: readonly StudioOriginalFreeAsset[] = Object.freeze([
  ...BASE_ASSETS,
  ...STUDIO_ORIGINAL_2D_EXPANSION_ASSETS,
]);

export function findStudioOriginalFreeAsset(assetId: unknown): StudioOriginalFreeAsset | null {
  if (typeof assetId !== "string") return null;
  return STUDIO_ORIGINAL_2D_EXPANSION_ASSETS.find((asset) => asset.id === assetId)
    ?? findBaseAsset(assetId);
}

export function findStudioOriginalFreeAssetPackage(
  packageId: unknown,
): StudioOriginalFreeAssetPackage | null {
  return findStudioOriginal2dExpansionPackage(packageId) ?? findBasePackage(packageId);
}

export function filterStudioOriginalFreeAssets(input: {
  readonly query?: string;
  readonly packageIds?: readonly string[];
  readonly categories?: readonly StudioOriginalFreeAssetCategory[];
} = {}): StudioOriginalFreeAsset[] {
  const query = input.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const packageIds = new Set(input.packageIds ?? []);
  const categories = new Set(input.categories ?? []);

  return STUDIO_ORIGINAL_FREE_ASSETS.filter((asset) => {
    if (packageIds.size > 0 && !packageIds.has(asset.packageId)) return false;
    if (categories.size > 0 && !categories.has(asset.category)) return false;
    if (!query) return true;
    return [asset.name, asset.category, ...asset.tags]
      .join("\n")
      .toLocaleLowerCase("ko-KR")
      .includes(query);
  });
}
