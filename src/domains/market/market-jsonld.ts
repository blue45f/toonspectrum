import { marketKindMeta } from "./market-kind";

import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";


// packages/core의 SITE_URL과 동일한 출처 — 마켓 도메인 전용 JSON-LD 헬퍼.
const MARKET_SITE_URL = "https://www.toonstudio.cloud";
const ITEMLIST_TOP = 20;

function itemListElements(items: readonly CreatorMarketplaceResourceRecord[]) {
  const topCount = Math.min(items.length, ITEMLIST_TOP);
  return Array.from({ length: topCount }, (_, index) => {
    const record = items[index]!;
    return {
      "@type": "ListItem",
      position: index + 1,
      name: record.name,
      url: `${MARKET_SITE_URL}/market/resource/${record.id}`,
    };
  });
}

/** 마켓 홈 — CollectionPage + 최신 리소스 ItemList. 항목이 없으면 null(주입 안 함). */
export function marketHomeJsonLd(items: readonly CreatorMarketplaceResourceRecord[]) {
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "툰스펙트럼 창작 마켓",
    url: `${MARKET_SITE_URL}/market`,
    mainEntity: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "최신 공유 리소스",
      numberOfItems: Math.min(items.length, ITEMLIST_TOP),
      itemListElement: itemListElements(items),
    },
  };
}

/** 마켓 탐색 — 현재 필터 결과의 ItemList. 항목이 없으면 null. */
export function marketBrowseJsonLd(
  items: readonly CreatorMarketplaceResourceRecord[],
  kind: string | undefined
) {
  if (items.length === 0) return null;
  const label = kind ? `${marketKindMeta(kind as never).label} · ` : "";
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `툰스펙트럼 창작 마켓 · ${label}탐색`,
    numberOfItems: Math.min(items.length, ITEMLIST_TOP),
    itemListElement: itemListElements(items),
  };
}
