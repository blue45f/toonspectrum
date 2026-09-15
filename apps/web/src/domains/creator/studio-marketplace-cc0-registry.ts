import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";
import { isStudioCc0EligibleForNewSelection } from "./studio-cc0-curation";

import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";

/** Source-controlled allowlist. Public manifests never supply a fetch URL. */
export function findStudioMarketplaceCc0Asset(id: string): StudioCc0Asset | null {
  const asset = STUDIO_MARKETPLACE_CC0_ASSETS.find((candidate) => candidate.id === id);
  return asset && isStudioCc0EligibleForNewSelection(asset) ? asset : null;
}

export function resolveStudioMarketplaceCc0Model(runtimeRef: string): StudioCc0Asset | null {
  const canonicalPrefix = "studio-3d-asset:cc0/";
  const legacyPrefix = "studio-3d-asset:";
  const id = runtimeRef.startsWith(canonicalPrefix)
    ? runtimeRef.slice(canonicalPrefix.length)
    : runtimeRef.startsWith(legacyPrefix)
      ? runtimeRef.slice(legacyPrefix.length)
      : "";
  if (!id || id.includes("/") || id.includes("..")) return null;
  const asset = findStudioMarketplaceCc0Asset(id);
  return asset?.kind === "model" ? asset : null;
}
