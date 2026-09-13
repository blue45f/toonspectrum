import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

/**
 * Live public catalog may include intentional CC0 delivery-verification packages under the
 * `qa/` package-id namespace. They remain purchasable/downloadable seed content, but their
 * QA-only labels must not be advertised as ordinary discovery keywords.
 */
export function isMarketQaPackageId(packageId: string | null | undefined): boolean {
  const value = (packageId ?? "").trim().toLowerCase();
  return value === "qa" || value.startsWith("qa/");
}

export function isMarketQaResource(
  record: Pick<CreatorMarketplaceResourceRecord, "packageId" | "name" | "tags" | "publisher">,
): boolean {
  if (isMarketQaPackageId(record.packageId)) return true;
  if (record.name.trim().startsWith("[테스트]")) return true;
  if ((record.publisher?.name ?? "").includes("(테스트)")) return true;
  return record.tags.some((tag) => {
    const normalized = tag.trim().toLowerCase();
    return (
      normalized.startsWith("qa-")
      || normalized === "qa"
      || normalized === "테스트 등록"
      || normalized === "테스트"
    );
  });
}

/** Keywords shown on the market home must map to real discovery intent, not QA bookkeeping. */
export function isMarketPublicKeywordTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("qa-") || normalized === "qa") return false;
  if (normalized === "테스트 등록" || normalized === "테스트") return false;
  if (normalized === "무료") return false;
  return true;
}
