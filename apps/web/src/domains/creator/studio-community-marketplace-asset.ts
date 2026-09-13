import { createStudioCc0ImageRecord, type StudioCc0Asset } from "./studio-cc0-asset-delivery";
import { createStudioOriginalFreeAssetRecord, type StudioOriginalFreeAsset } from "./studio-original-free-asset-packs";
import type { StudioAsset } from "./studio-asset-library";

export type StudioCommunityImageAsset = StudioOriginalFreeAsset | StudioCc0Asset;

export async function createStudioCommunityMarketplaceAssetRecord(
  asset: StudioCommunityImageAsset,
  signal?: AbortSignal,
): Promise<StudioAsset> {
  signal?.throwIfAborted();
  if ("svg" in asset) return createStudioOriginalFreeAssetRecord(asset);
  return createStudioCc0ImageRecord(asset, signal);
}
