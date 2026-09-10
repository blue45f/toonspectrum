import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";

export type MarketSceneJourneyFamily = "template" | "asset" | "brush" | "look";

export function marketSceneCompletionSequenceForKind(
  kind: CreatorMarketplaceResourceKind,
): readonly MarketSceneJourneyFamily[] {
  if (kind === "template") return ["asset", "brush", "look"];
  if (kind === "asset") return ["template", "brush", "look"];
  if (kind === "brush") return ["template", "asset", "look"];
  if (kind === "palette" || kind === "filter") return ["template", "asset", "brush"];
  return ["template", "asset", "brush"];
}

export function marketSceneCompletionBrowseHref(kind: string, tag: string | null): string {
  const params = new URLSearchParams({ kind });
  if (tag) params.set("tag", tag);
  return `/market/browse?${params.toString()}`;
}
