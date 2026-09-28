import type { CreatorMarketplaceCloudLibraryItem } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";

import { marketKindMeta } from "./market-kind";

export type MarketLibraryStatus = "all" | "available" | "updates" | "unconfirmed" | "unavailable";
export type MarketLibrarySort = "recent" | "oldest" | "name";
export interface MarketLibraryFilters {
  readonly search: string;
  readonly kind: "all" | CreatorMarketplaceResourceKind;
  readonly status: MarketLibraryStatus;
  readonly sort: MarketLibrarySort;
}
export const DEFAULT_LIBRARY_FILTERS: MarketLibraryFilters = {
  search: "", kind: "all", status: "all", sort: "recent",
};
export const MARKET_LIBRARY_STATUSES: readonly { value: MarketLibraryStatus; label: string; english: string }[] = [
  { value: "all", label: "전체 상태", english: "All statuses" },
  { value: "available", label: "현재 공개 중", english: "Currently listed" },
  { value: "updates", label: "계정 이력상 업데이트", english: "Updates in account history" },
  { value: "unconfirmed", label: "계정 설치 이력 없음", english: "No account install history" },
  { value: "unavailable", label: "현재 공개 안 됨", english: "Not currently listed" },
];

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

/** 계정의 과거 설치 이력만 분류하며 현재 기기의 설치 여부를 추론하지 않는다. */
export function matchesLibraryStatus(item: CreatorMarketplaceCloudLibraryItem, status: MarketLibraryStatus): boolean {
  if (status === "all") return true;
  if (status === "unavailable") return item.catalog.state === "unavailable";
  if (item.catalog.state !== "available") return false;
  if (status === "available") return true;
  if (status === "unconfirmed") return item.confirmation.state === "none";
  return item.confirmation.state === "confirmed" && item.updateState === "account-confirmed-update-available";
}

/** 불러온 페이지에만 적용한다. 서버 전체 검색·전체 개수로 표시하지 않는다. */
export function exploreMarketLibrary(
  items: readonly CreatorMarketplaceCloudLibraryItem[],
  filters: MarketLibraryFilters,
): CreatorMarketplaceCloudLibraryItem[] {
  const terms = normalize(filters.search).trim().split(/\s+/u).filter(Boolean);
  return items.filter((item) => {
    if (filters.kind !== "all" && item.kind !== filters.kind) return false;
    if (!matchesLibraryStatus(item, filters.status)) return false;
    const text = normalize([
      item.name, item.packageId, marketKindMeta(item.kind).label, marketKindMeta(item.kind).english,
      item.addedFrom.resourceVersion,
      item.catalog.state === "available" ? `${item.catalog.head.name} ${item.catalog.head.resourceVersion}` : "",
    ].join(" "));
    return terms.every((term) => text.includes(term));
  }).sort((left, right) => {
    const difference = filters.sort === "name"
      ? left.name.localeCompare(right.name, "ko", { numeric: true, sensitivity: "base" })
      : (Date.parse(left.addedAt) - Date.parse(right.addedAt)) * (filters.sort === "recent" ? -1 : 1);
    return difference || left.id.localeCompare(right.id);
  });
}

export function hasLibraryFilters(filters: MarketLibraryFilters): boolean {
  return Boolean(filters.search.trim() || filters.kind !== "all" || filters.status !== "all");
}
