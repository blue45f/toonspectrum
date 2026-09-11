import { describe, expect, it } from "vitest";

import {
  searchStudioMarketplace,
  type StudioMarketplaceSearchItem,
  type StudioMarketplaceSearchQuery,
} from "./studio-marketplace-search";

const CATALOG: readonly StudioMarketplaceSearchItem[] = [
  {
    id: "school-3d",
    title: "웹툰 학교 3D 배경",
    description: "교실과 복도를 포함한 웹툰 제작용 배경",
    tags: ["학교", "배경", "웹툰"],
    type: "3d-background",
    compatibilityTargets: ["web", "desktop"],
    destinations: ["webtoon", "video"],
    priceMinor: 19000,
    currency: "KRW",
    rating: 4.8,
    reviewCount: 120,
    qualityScore: 94,
    aiClassification: "none",
    owned: true,
    installed: true,
    saved: true,
    rightsStatus: "allowed",
    updatedAt: "2026-09-10T00:00:00.000Z",
  },
  {
    id: "school-2d",
    title: "학교 교실 2D 이미지",
    description: "생성형 AI 보조로 제작한 교실 이미지",
    tags: ["학교", "교실"],
    type: "2d-background",
    compatibilityTargets: ["web", "mobile"],
    destinations: ["webtoon"],
    priceMinor: 9000,
    currency: "KRW",
    rating: 4.6,
    reviewCount: 60,
    qualityScore: 88,
    aiClassification: "assisted",
    owned: false,
    installed: false,
    saved: true,
    rightsStatus: "warning",
    updatedAt: "2026-09-11T00:00:00.000Z",
  },
  {
    id: "blocked-school",
    title: "학교 무허가 배경",
    description: "현재 용도로 사용할 수 없음",
    tags: ["학교"],
    type: "2d-background",
    compatibilityTargets: ["web"],
    destinations: ["webtoon"],
    priceMinor: 1000,
    currency: "KRW",
    rating: 5,
    reviewCount: 2,
    qualityScore: 99,
    aiClassification: "generated",
    owned: false,
    installed: false,
    saved: false,
    rightsStatus: "blocked",
    updatedAt: "2026-09-12T00:00:00.000Z",
  },
];

const BASE_QUERY: StudioMarketplaceSearchQuery = Object.freeze({
  text: "학교 배경",
  types: [],
  compatibilityTargets: [],
  destinations: ["webtoon"],
  aiClassifications: [],
  minimumPriceMinor: null,
  maximumPriceMinor: null,
  onlyOwned: false,
  onlyInstalled: false,
  onlySaved: false,
  includeBlockedRights: false,
  sort: "relevance",
  limit: 20,
});

describe("Studio marketplace search", () => {
  it("ranks relevant compatible assets while hiding blocked rights by default", () => {
    const result = searchStudioMarketplace(CATALOG, BASE_QUERY);
    expect(result.total).toBe(2);
    expect(result.hits.map((hit) => hit.item.id)).toEqual(["school-3d", "school-2d"]);
    expect(result.hits.every((hit) => hit.item.rightsStatus !== "blocked")).toBe(true);
    expect(result.typeFacets).toEqual(expect.arrayContaining([
      { value: "2d-background", count: 1 },
      { value: "3d-background", count: 1 },
    ]));
  });

  it("filters owned, installed, saved and AI classifications", () => {
    expect(searchStudioMarketplace(CATALOG, {
      ...BASE_QUERY,
      text: "",
      onlyOwned: true,
      onlyInstalled: true,
      onlySaved: true,
      aiClassifications: ["none"],
    }).hits.map((hit) => hit.item.id)).toEqual(["school-3d"]);
  });

  it("can include blocked results only when explicitly requested", () => {
    expect(searchStudioMarketplace(CATALOG, {
      ...BASE_QUERY,
      includeBlockedRights: true,
      sort: "quality",
    }).hits[0]?.item.id).toBe("blocked-school");
  });

  it("sorts deterministically by price and validates ranges", () => {
    expect(searchStudioMarketplace(CATALOG, {
      ...BASE_QUERY,
      text: "",
      sort: "price-asc",
    }).hits.map((hit) => hit.item.id)).toEqual(["school-2d", "school-3d"]);
    expect(() => searchStudioMarketplace(CATALOG, {
      ...BASE_QUERY,
      minimumPriceMinor: 20000,
      maximumPriceMinor: 10000,
    })).toThrow("filters are invalid");
  });
});
