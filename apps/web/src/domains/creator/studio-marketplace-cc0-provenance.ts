import { findStudioMarketplaceCc0Asset } from "./studio-marketplace-cc0-catalog";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

type MarketRecord = Pick<CreatorMarketplaceResourceRecord, "kind" | "license" | "provenance">;
type MarketEntry = CreatorMarketplaceResourceRecord["entries"][number];

/** Preserve existing non-CC0 delivery; a registered CC0 file cannot authenticate a relabelled release. */
export function studioMarketplaceCc0EntrySourceMatches(
  record: MarketRecord,
  entry: MarketEntry,
): boolean {
  const reference = entry.delivery.mode === "builtin-ref"
    ? entry.delivery.runtimeRef
    : entry.delivery.mode === "procedural-recipe"
      ? entry.delivery.payload.definition.recipeId
      : null;
  const normalized = typeof reference === "string" && reference.startsWith("studio-asset:")
    ? reference.slice("studio-asset:".length)
    : reference;
  const asset = findStudioMarketplaceCc0Asset(normalized);
  if (!asset) return true;
  return (record.kind === "asset" || record.kind === "3d-asset")
    && entry.kind === record.kind
    && (record.kind === "3d-asset") === (asset.kind === "model")
    && record.license === "cc0-1.0"
    && record.provenance.origin === "permissive"
    && record.provenance.authoredByPublisher === false
    && record.provenance.sourceUrl === asset.sourceUrl
    && record.provenance.sourceLicenseUrl === "https://creativecommons.org/publicdomain/zero/1.0/";
}
