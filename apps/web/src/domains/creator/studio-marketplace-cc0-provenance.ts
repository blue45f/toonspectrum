import {
  findStudioMarketplaceCc0Asset,
  resolveStudioMarketplaceCc0Entry,
  studioMarketplaceCc0EntryRef,
} from "./studio-marketplace-cc0-assets";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

type MarketRecord = Pick<CreatorMarketplaceResourceRecord, "kind" | "license" | "provenance" | "entries">;
type MarketEntry = CreatorMarketplaceResourceRecord["entries"][number];

/** Preserve non-CC0 delivery; a registered CC0 file cannot authenticate a relabelled release. */
export function studioMarketplaceCc0EntrySourceMatches(
  record: MarketRecord,
  entry: MarketEntry,
): boolean {
  const registered = findStudioMarketplaceCc0Asset(studioMarketplaceCc0EntryRef(entry));
  return registered === null || resolveStudioMarketplaceCc0Entry(record, entry) !== null;
}
