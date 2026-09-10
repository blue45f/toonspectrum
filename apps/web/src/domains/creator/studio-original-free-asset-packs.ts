import {
  STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  STUDIO_ORIGINAL_FREE_ASSET_PACKAGES as BASE_PACKAGES,
  STUDIO_ORIGINAL_FREE_ASSETS as BASE_ASSETS,
  findStudioOriginalFreeAsset as findBaseAsset,
  findStudioOriginalFreeAssetPackage as findBasePackage,
  type StudioOriginalFreeAsset,
  type StudioOriginalFreeAssetCategory,
  type StudioOriginalFreeAssetPackage,
} from "./studio-original-free-asset-packs-base";
import {
  STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES,
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

const BASE_ASSET_IDS = new Set(BASE_ASSETS.map((asset) => asset.id));

function normalizeExpansionAsset(asset: StudioOriginalFreeAsset): StudioOriginalFreeAsset {
  // Existing ids are project/runtime contracts. New authored material never replaces an
  // older visual just because a catalog author picked the same descriptive slug.
  const replacementId = !BASE_ASSET_IDS.has(asset.id)
    ? asset.id
    : asset.id === "original-city-bicycle"
      ? "original-city-commuter-bike"
      : `${asset.id}-v2`;

  // The expansion authoring module is loaded through this public facade. Re-stamp the
  // canonical base license at the aggregation boundary so ESM initialization order can
  // never expose incomplete package or item rights metadata to Studio consumers.
  return Object.freeze({
    ...asset,
    id: replacementId,
    contentFingerprint: replacementId === asset.id
      ? asset.contentFingerprint
      : `original-svg:v2:${replacementId}`,
    license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  });
}

const EXPANSION_PACKAGES: readonly StudioOriginalFreeAssetPackage[] = Object.freeze(
  STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES.map((pkg) => {
    const includedItems = Object.freeze(pkg.includedItems.map(normalizeExpansionAsset));
    return Object.freeze({
      ...pkg,
      license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
      includedItems,
      packageFingerprint: `${pkg.packageFingerprint}:normalized`,
    });
  }),
);

const EXPANSION_ASSETS: readonly StudioOriginalFreeAsset[] = Object.freeze(
  EXPANSION_PACKAGES.flatMap((pkg) => pkg.includedItems),
);

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
    ...EXPANSION_PACKAGES,
  ]);

export const STUDIO_ORIGINAL_FREE_ASSETS: readonly StudioOriginalFreeAsset[] = Object.freeze([
  ...BASE_ASSETS,
  ...EXPANSION_ASSETS,
]);

const PACKAGE_SEARCH_TEXT: ReadonlyMap<string, string> = new Map(
  STUDIO_ORIGINAL_FREE_ASSET_PACKAGES.map((pkg) => [
    pkg.id,
    [pkg.name, pkg.summary, pkg.category, ...pkg.tags]
      .join("\n")
      .toLocaleLowerCase("ko-KR"),
  ]),
);

const ASSET_SEARCH_TEXT: ReadonlyMap<string, string> = new Map(
  STUDIO_ORIGINAL_FREE_ASSETS.map((asset) => [
    asset.id,
    [
      asset.name,
      asset.category,
      ...asset.tags,
      PACKAGE_SEARCH_TEXT.get(asset.packageId) ?? "",
    ]
      .join("\n")
      .toLocaleLowerCase("ko-KR"),
  ]),
);

export function findStudioOriginalFreeAsset(assetId: unknown): StudioOriginalFreeAsset | null {
  if (typeof assetId !== "string") return null;
  return findBaseAsset(assetId)
    ?? EXPANSION_ASSETS.find((asset) => asset.id === assetId)
    ?? null;
}

export function findStudioOriginalFreeAssetPackage(
  packageId: unknown,
): StudioOriginalFreeAssetPackage | null {
  return findBasePackage(packageId)
    ?? EXPANSION_PACKAGES.find((pkg) => pkg.id === packageId)
    ?? null;
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
    return (ASSET_SEARCH_TEXT.get(asset.id) ?? "").includes(query);
  });
}
