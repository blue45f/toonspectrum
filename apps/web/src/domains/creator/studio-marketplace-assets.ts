import { createStudioCc0ImageRecord } from "./studio-cc0-asset-delivery";
import { findStudioMarketplaceCc0Asset } from "./studio-marketplace-cc0-registry";
import { createStudioOriginalFreeAssetRecord, findStudioOriginalFreeAsset } from "./studio-original-free-asset-packs";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";
import type { StudioOriginalFreeAsset } from "./studio-original-free-asset-packs";

export type StudioMarketplaceImageAsset = StudioOriginalFreeAsset | StudioCc0Asset;

export function findStudioMarketplaceImageAsset(id: string): StudioMarketplaceImageAsset | null {
  const original = findStudioOriginalFreeAsset(id);
  if (original) return original;
  const cc0 = findStudioMarketplaceCc0Asset(id);
  return cc0 && cc0.kind !== "model" ? cc0 : null;
}

/** Resolve bytes only from the local catalog, never from a manifest-provided path. */
export async function createStudioMarketplaceImageRecord(
  asset: StudioMarketplaceImageAsset,
  signal?: AbortSignal,
): Promise<StudioAsset> {
  signal?.throwIfAborted();
  const original = findStudioOriginalFreeAsset(asset.id);
  if (original) return createStudioOriginalFreeAssetRecord(original);
  const cc0 = findStudioMarketplaceCc0Asset(asset.id);
  if (!cc0 || cc0.kind === "model") throw new Error("검증된 2D 마켓 에셋이 아닙니다.");
  return createStudioCc0ImageRecord(cc0, signal);
}
