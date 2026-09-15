import {
  findStudioMarketplaceCc0Asset as findRegisteredStudioMarketplaceCc0Asset,
  STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX,
  STUDIO_MARKETPLACE_CC0_MODEL_PREFIX,
} from "./studio-marketplace-cc0-assets";

import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";

/** Compatibility facade over the single source-controlled CC0 reference registry. */
export function findStudioMarketplaceCc0Asset(reference: unknown): StudioCc0Asset | null {
  return findRegisteredStudioMarketplaceCc0Asset(reference);
}

/** New manifests always emit the namespaced canonical reference. */
export function studioMarketplaceCc0Reference(asset: StudioCc0Asset): string {
  return `${asset.kind === "model"
    ? STUDIO_MARKETPLACE_CC0_MODEL_PREFIX
    : STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX}${asset.id}`;
}
