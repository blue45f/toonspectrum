import {
  Box,
  Brush,
  Images,
  LayoutTemplate,
  Palette,
  type LucideIcon,
} from "lucide-react";

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";

export interface MarketResourceSubcategory {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly tag?: string;
}

export interface MarketResourceFamily {
  readonly id: "template" | "2d" | "3d" | "brush" | "look";
  readonly label: string;
  readonly english: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly accentHue: number;
  readonly subcategories: readonly MarketResourceSubcategory[];
}

/**
 * Subcategory deep-links must not advertise tags/kinds the public catalog cannot satisfy.
 * Empty niche tags (회차/로맨스 template, 인체, 무기, …) are omitted; callers browse by kind
 * or by tags confirmed present in the live public list (소품/배경/학교/3D).
 */
export const MARKET_RESOURCE_FAMILIES: readonly MarketResourceFamily[] = Object.freeze([
  {
    id: "template",
    label: "템플릿",
    english: "TEMPLATES",
    description: "빈 화면에서 시작하지 않고 컷 구성·대사 리듬·연출이 준비된 장면부터 시작합니다.",
    icon: LayoutTemplate,
    accentHue: 232,
    subcategories: [
      { id: "all-templates", label: "전체 템플릿", description: "공개된 템플릿이 있으면 여기에 모입니다", kind: "template" },
    ],
  },
  {
    id: "2d",
    label: "2D 에셋",
    english: "2D ASSETS",
    description: "캔버스에 바로 끌어 놓는 배경·소품·효과·패턴과 웹툰용 그래픽 요소입니다.",
    icon: Images,
    accentHue: 92,
    subcategories: [
      { id: "background", label: "배경", description: "실내·거리·학교·회사·자연", kind: "asset", tag: "배경" },
      { id: "props", label: "소품", description: "생활·가구·전자기기·음식", kind: "asset", tag: "소품" },
      { id: "all-2d", label: "2D 전체", description: "태그 없이 모든 2D 에셋", kind: "asset" },
      { id: "school", label: "학교·교실", description: "학원물 장면에 맞는 공개 태그", kind: "asset", tag: "학교" },
    ],
  },
  {
    id: "3d",
    label: "3D",
    english: "3D ASSETS",
    description: "카메라를 돌려 구도를 잡고 웹툰 배경과 데생 기준으로 바로 연결하는 3D 리소스입니다.",
    icon: Box,
    accentHue: 194,
    subcategories: [
      { id: "all-3d", label: "3D 전체", description: "공개된 3D 에셋 전체", kind: "3d-asset" },
      { id: "prop", label: "소품", description: "가구·생활 사물 3D", kind: "3d-asset", tag: "소품" },
      { id: "tagged-3d", label: "3D 태그", description: "3D 키워드로 모아보기", kind: "3d-asset", tag: "3D" },
      { id: "presets", label: "3D 프리셋", description: "카메라·조명 프리셋이 있으면 여기에 모입니다", kind: "3d-preset" },
    ],
  },
  {
    id: "brush",
    label: "브러시",
    english: "BRUSHES",
    description: "선화부터 채색·질감·효과까지 목적에 맞는 브러시를 Studio에 바로 설치합니다.",
    icon: Brush,
    accentHue: 150,
    subcategories: [
      { id: "all-brushes", label: "브러시 전체", description: "공개된 브러시가 있으면 여기에 모입니다", kind: "brush" },
    ],
  },
  {
    id: "look",
    label: "색·보정",
    english: "COLOR & LOOK",
    description: "팔레트와 필터를 묶어 작품의 장르 톤과 장면 분위기를 빠르게 맞춥니다.",
    icon: Palette,
    accentHue: 318,
    subcategories: [
      { id: "palettes", label: "팔레트", description: "공개된 색 팔레트", kind: "palette" },
      { id: "filters", label: "필터·보정", description: "공개된 색보정·분위기 필터", kind: "filter" },
    ],
  },
]);

export const MARKET_RESOURCE_FAMILY_BY_ID = new Map(
  MARKET_RESOURCE_FAMILIES.map((family) => [family.id, family]),
);

export function marketResourceBrowseHref(
  item: Pick<MarketResourceSubcategory, "kind" | "tag">,
): string {
  const params = new URLSearchParams({ kind: item.kind });
  if (item.tag) params.set("tag", item.tag);
  return `/market/browse?${params.toString()}`;
}
