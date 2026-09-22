import { useCampus } from "@/shared/components/spatial-campus/campus-context";
import type { CreatorMarketplaceInstallReceiptState } from "@/shared/lib/creator-marketplace-install-receipt";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import { marketStudioHandoff, type MarketStudioHandoff } from "../models/market-studio-handoff";

/**
 * Reuses the current tab's owner-scoped campus document receipt when available.
 * The model validates the receipt again; an invalid or expired target falls back to /studio.
 */
export function useMarketStudioHandoff(
  record: Pick<CreatorMarketplaceResourceRecord, "id" | "kind" | "resourceVersion">,
  installState: CreatorMarketplaceInstallReceiptState = "no-verified-receipt",
): MarketStudioHandoff {
  const campus = useCampus();
  return marketStudioHandoff(record, installState, campus?.returnHref ?? null);
}
