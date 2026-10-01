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
  readonly labelEn: string;
  readonly description: string;
  readonly descriptionEn: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly tag?: string;
}

export type MarketResourceFamilyId = "template" | "2d" | "3d" | "brush" | "look";

export interface MarketResourceFamily {
  readonly id: MarketResourceFamilyId;
  readonly label: string;
  /** 영어 화면용 라벨(문장형). */
  readonly labelEn: string;
  /** 영문 대문자 아이브로. */
  readonly english: string;
  readonly description: string;
  readonly descriptionEn: string;
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
    labelEn: "Templates",
    english: "TEMPLATES",
    description: "빈 화면에서 시작하지 않고 컷 구성·대사 리듬·연출이 준비된 장면부터 시작합니다.",
    descriptionEn: "Start from a scene whose panel layout, dialogue rhythm and staging are already prepared instead of a blank page.",
    icon: LayoutTemplate,
    accentHue: 232,
    subcategories: [
      { id: "all-templates", label: "전체 템플릿", labelEn: "All templates", description: "공개된 템플릿이 있으면 여기에 모입니다", descriptionEn: "Public templates collect here when available", kind: "template" },
    ],
  },
  {
    id: "2d",
    label: "2D 에셋",
    labelEn: "2D assets",
    english: "2D ASSETS",
    description: "캔버스에 바로 끌어 놓는 배경·소품·효과·패턴과 웹툰용 그래픽 요소입니다.",
    descriptionEn: "Backgrounds, props, effects, patterns and webtoon graphics you can drag straight onto the canvas.",
    icon: Images,
    accentHue: 92,
    subcategories: [
      { id: "background", label: "배경", labelEn: "Backgrounds", description: "실내·거리·학교·회사·자연", descriptionEn: "Interiors, streets, schools, offices and nature", kind: "asset", tag: "배경" },
      { id: "props", label: "소품", labelEn: "Props", description: "생활·가구·전자기기·음식", descriptionEn: "Everyday items, furniture, devices and food", kind: "asset", tag: "소품" },
      { id: "all-2d", label: "2D 전체", labelEn: "All 2D", description: "태그 없이 모든 2D 에셋", descriptionEn: "Every 2D asset without a tag filter", kind: "asset" },
      { id: "school", label: "학교·교실", labelEn: "School & classroom", description: "학원물 장면에 맞는 공개 태그", descriptionEn: "Public tag for school-life scenes", kind: "asset", tag: "학교" },
    ],
  },
  {
    id: "3d",
    label: "3D",
    labelEn: "3D",
    english: "3D ASSETS",
    description: "카메라를 돌려 구도를 잡고 웹툰 배경과 데생 기준으로 바로 연결하는 3D 리소스입니다.",
    descriptionEn: "3D resources you orbit to find a composition and connect straight to webtoon backgrounds and drawing references.",
    icon: Box,
    accentHue: 194,
    subcategories: [
      { id: "all-3d", label: "3D 전체", labelEn: "All 3D", description: "공개된 3D 에셋 전체", descriptionEn: "Every public 3D asset", kind: "3d-asset" },
      { id: "prop", label: "소품", labelEn: "Props", description: "가구·생활 사물 3D", descriptionEn: "3D furniture and everyday objects", kind: "3d-asset", tag: "소품" },
      { id: "tagged-3d", label: "3D 태그", labelEn: "3D tag", description: "3D 키워드로 모아보기", descriptionEn: "Collected by the 3D keyword", kind: "3d-asset", tag: "3D" },
      { id: "presets", label: "3D 프리셋", labelEn: "3D presets", description: "카메라·조명 프리셋이 있으면 여기에 모입니다", descriptionEn: "Camera and lighting presets collect here when available", kind: "3d-preset" },
    ],
  },
  {
    id: "brush",
    label: "브러시",
    labelEn: "Brushes",
    english: "BRUSHES",
    description: "선화부터 채색·질감·효과까지 목적에 맞는 브러시를 Studio에 바로 설치합니다.",
    descriptionEn: "Brushes for line art, coloring, texture and effects that install straight into Studio.",
    icon: Brush,
    accentHue: 150,
    subcategories: [
      { id: "all-brushes", label: "브러시 전체", labelEn: "All brushes", description: "공개된 브러시가 있으면 여기에 모입니다", descriptionEn: "Public brushes collect here when available", kind: "brush" },
    ],
  },
  {
    id: "look",
    label: "색·보정",
    labelEn: "Color & look",
    english: "COLOR & LOOK",
    description: "팔레트와 필터를 묶어 작품의 장르 톤과 장면 분위기를 빠르게 맞춥니다.",
    descriptionEn: "Palettes and filters that quickly match your genre tone and scene mood.",
    icon: Palette,
    accentHue: 318,
    subcategories: [
      { id: "palettes", label: "팔레트", labelEn: "Palettes", description: "공개된 색 팔레트", descriptionEn: "Public color palettes", kind: "palette" },
      { id: "filters", label: "필터·보정", labelEn: "Filters & grading", description: "공개된 색보정·분위기 필터", descriptionEn: "Public color-grading and mood filters", kind: "filter" },
    ],
  },
]);

export const MARKET_RESOURCE_FAMILY_BY_ID = new Map(
  MARKET_RESOURCE_FAMILIES.map((family) => [family.id, family]),
);

const FAMILY_ID_BY_KIND: Readonly<Record<CreatorMarketplaceResourceKind, MarketResourceFamilyId>> = {
  template: "template",
  asset: "2d",
  "3d-asset": "3d",
  "3d-preset": "3d",
  brush: "brush",
  palette: "look",
  filter: "look",
};

function isResourceKind(kind: string): kind is CreatorMarketplaceResourceKind {
  return Object.hasOwn(FAMILY_ID_BY_KIND, kind);
}

/** 리소스 종류(kind)가 속한 작업군. 알 수 없는 값이면 null. */
export function marketResourceFamilyForKind(kind: string | null | undefined): MarketResourceFamily | null {
  if (!kind || !isResourceKind(kind)) return null;
  return MARKET_RESOURCE_FAMILY_BY_ID.get(FAMILY_ID_BY_KIND[kind]) ?? null;
}

export function marketResourceBrowseHref(
  item: Pick<MarketResourceSubcategory, "kind" | "tag">,
): string {
  const params = new URLSearchParams({ kind: item.kind });
  if (item.tag) params.set("tag", item.tag);
  return `/market/browse?${params.toString()}`;
}
