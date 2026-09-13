import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { isStudioCc0EligibleForNewSelection } from "./studio-cc0-curation";
import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";

/** Only reviewed, hash-pinned bundled files can be resolved. No publisher-supplied URLs. */
export function findStudioMarketplaceCc0Asset(reference: unknown): StudioCc0Asset | null {
  if (typeof reference !== "string") return null;
  const modelPrefix = "studio-3d-asset:";
  const imagePrefix = "cc0/";
  const model = reference.startsWith(modelPrefix);
  const id = model ? reference.slice(modelPrefix.length)
    : reference.startsWith(imagePrefix) ? reference.slice(imagePrefix.length) : "";
  const asset = STUDIO_MARKETPLACE_CC0_ASSETS.find(item => item.id === id);
  return asset && (asset.kind === "model") === model && isStudioCc0EligibleForNewSelection(asset)
    ? asset : null;
}

export function studioMarketplaceCc0Reference(asset: StudioCc0Asset): string {
  return asset.kind === "model" ? `studio-3d-asset:${asset.id}` : `cc0/${asset.id}`;
}
