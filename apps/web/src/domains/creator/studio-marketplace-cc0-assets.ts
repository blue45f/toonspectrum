import { STUDIO_MARKETPLACE_CC0_ASSETS } from "./studio-marketplace-cc0-catalog.generated";

import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export const STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX = "studio-asset:cc0/";
export const STUDIO_MARKETPLACE_CC0_MODEL_PREFIX = "studio-3d-asset:cc0/";

const LEGACY_IMAGE_PREFIX = "cc0/";
const LEGACY_MODEL_PREFIX = "studio-3d-asset:";
const LEGACY_BUILTIN_IMAGE_PREFIX = "studio-asset:";

type MarketRecord = Pick<CreatorMarketplaceResourceRecord, "kind" | "license" | "provenance" | "entries">;
type MarketEntry = CreatorMarketplaceResourceRecord["entries"][number];

function parseStudioMarketplaceCc0Reference(
  runtimeRef: string,
): { readonly id: string; readonly model: boolean } | null {
  if (runtimeRef.startsWith(STUDIO_MARKETPLACE_CC0_MODEL_PREFIX)) {
    return { id: runtimeRef.slice(STUDIO_MARKETPLACE_CC0_MODEL_PREFIX.length), model: true };
  }
  if (runtimeRef.startsWith(STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX)) {
    return { id: runtimeRef.slice(STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX.length), model: false };
  }
  if (runtimeRef.startsWith(LEGACY_IMAGE_PREFIX)) {
    return { id: runtimeRef.slice(LEGACY_IMAGE_PREFIX.length), model: false };
  }
  if (runtimeRef.startsWith(LEGACY_MODEL_PREFIX)) {
    return { id: runtimeRef.slice(LEGACY_MODEL_PREFIX.length), model: true };
  }
  if (runtimeRef.startsWith(LEGACY_BUILTIN_IMAGE_PREFIX)) {
    return { id: runtimeRef.slice(LEGACY_BUILTIN_IMAGE_PREFIX.length), model: false };
  }
  return null;
}

/** Only version-controlled catalog references, never publisher-supplied paths or URLs. */
export function findStudioMarketplaceCc0Asset(runtimeRef: unknown): StudioCc0Asset | null {
  if (typeof runtimeRef !== "string") return null;
  const reference = parseStudioMarketplaceCc0Reference(runtimeRef);
  if (!reference) {
    if (!runtimeRef || runtimeRef.includes("/") || runtimeRef.includes("..")) return null;
    return STUDIO_MARKETPLACE_CC0_ASSETS.find((asset) => asset.id === runtimeRef) ?? null;
  }
  if (!reference.id || reference.id.includes("/") || reference.id.includes("..")) return null;
  return STUDIO_MARKETPLACE_CC0_ASSETS.find((asset) =>
    asset.id === reference.id && (asset.kind === "model") === reference.model,
  ) ?? null;
}

export function studioMarketplaceCc0EntryRef(entry: MarketEntry): string | null {
  if (entry.delivery.mode === "builtin-ref") return entry.delivery.runtimeRef;
  if (entry.delivery.mode !== "procedural-recipe") return null;
  const value = entry.delivery.payload.definition.recipeId;
  return typeof value === "string" ? value : null;
}

/** A known file must not lend its identity or preview to a falsely relabelled release. */
export function resolveStudioMarketplaceCc0Entry(
  record: MarketRecord,
  entry: MarketEntry,
): StudioCc0Asset | null {
  if (record.kind !== "asset" && record.kind !== "3d-asset") return null;
  if (entry.kind !== record.kind || record.license !== "cc0-1.0") return null;
  const asset = findStudioMarketplaceCc0Asset(studioMarketplaceCc0EntryRef(entry));
  if (!asset || (record.kind === "3d-asset") !== (asset.kind === "model")) return null;
  if (
    record.provenance.origin !== "permissive"
    || record.provenance.authoredByPublisher !== false
    || record.provenance.sourceUrl !== asset.sourceUrl
    || record.provenance.sourceLicenseUrl
      !== "https://creativecommons.org/publicdomain/zero/1.0/"
  ) {
    return null;
  }
  return asset;
}
