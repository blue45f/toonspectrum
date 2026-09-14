import { createStudioCc0ImageRecord, type StudioCc0Asset } from "./studio-cc0-asset-delivery";
import {
  createStudioOriginalFreeAssetRecord,
  type StudioOriginalFreeAsset,
} from "./studio-original-free-asset-packs";

import type { StudioAsset } from "./studio-asset-library";

export type StudioCommunityRenderableAsset = StudioOriginalFreeAsset | StudioCc0Asset;

/** Images retain their verified raster bytes and source rights; they are not relabelled as SVG. */
export async function createStudioCommunityAssetRecord(
  asset: StudioCommunityRenderableAsset,
  signal?: AbortSignal,
): Promise<StudioAsset> {
  signal?.throwIfAborted();
  if ("path" in asset) return createStudioCc0ImageRecord(asset, signal);
  return createStudioOriginalFreeAssetRecord(asset);
}
