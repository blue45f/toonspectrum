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

export const MARKET_RESOURCE_FAMILIES: readonly MarketResourceFamily[] = Object.freeze([
  {
    id: "template",
    label: "템플릿",
    english: "TEMPLATES",
    description: "빈 화면에서 시작하지 않고 컷 구성·대사 리듬·연출이 준비된 장면부터 시작합니다.",
    icon: LayoutTemplate,
    accentHue: 232,
    subcategories: [
      { id: "episode", label: "회차 구성", description: "세로 웹툰 회차와 장면 흐름", kind: "template", tag: "회차" },
      { id: "romance", label: "로맨스 연출", description: "고백·재회·데이트·감정 장면", kind: "template", tag: "로맨스" },
      { id: "action", label: "액션·긴장", description: "대치·추격·타격·클리프행어", kind: "template", tag: "액션" },
      { id: "fantasy", label: "판타지", description: "상태창·소환·왕실·던전", kind: "template", tag: "판타지" },
      { id: "daily", label: "일상·대화", description: "학교·회사·메신저·생활 장면", kind: "template", tag: "일상" },
      { id: "title", label: "타이틀·공지", description: "프롤로그·장 구분·휴재·복귀", kind: "template", tag: "타이틀" },
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
      { id: "props", label: "소품", description: "생활·가구·전자기기·음식·무기", kind: "asset", tag: "소품" },
      { id: "fx", label: "효과", description: "빛·날씨·감정·속도·마법", kind: "asset", tag: "오버레이" },
      { id: "nature", label: "자연·생물", description: "식물·꽃·동물·크리처", kind: "asset", tag: "자연" },
      { id: "pattern", label: "패턴·소재", description: "천·벽·바닥·망점·장식", kind: "asset", tag: "패턴" },
      { id: "gui", label: "GUI·그래픽", description: "상태창·메신저·간판·화면 요소", kind: "asset", tag: "GUI" },
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
      { id: "scene", label: "배경·공간", description: "집·학교·회사·상점·거리", kind: "3d-asset", tag: "배경" },
      { id: "prop", label: "소품", description: "가구·차량·무기·생활 사물", kind: "3d-asset", tag: "소품" },
      { id: "body", label: "인체·포즈", description: "데생 소체·손·포즈·군중", kind: "3d-asset", tag: "인체" },
      { id: "nature", label: "자연·생물", description: "식생·지형·동물·크리처", kind: "3d-asset", tag: "자연" },
      { id: "camera", label: "카메라 프리셋", description: "웹툰 구도·렌즈·투시 시작점", kind: "3d-preset", tag: "카메라" },
      { id: "lighting", label: "조명 프리셋", description: "낮·밤·실내·무드 라이팅", kind: "3d-preset", tag: "조명" },
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
      { id: "inking", label: "펜·선화", description: "G펜·매핑펜·잉크·벡터 선", kind: "brush", tag: "선화" },
      { id: "sketch", label: "스케치", description: "연필·목탄·러프 드로잉", kind: "brush", tag: "스케치" },
      { id: "paint", label: "채색", description: "수채·유화·과슈·마커", kind: "brush", tag: "채색" },
      { id: "texture", label: "질감", description: "천·금속·돌·피부·자연물", kind: "brush", tag: "질감" },
      { id: "effect", label: "이펙트", description: "빛·먼지·속도·마법·입자", kind: "brush", tag: "이펙트" },
      { id: "eraser", label: "지우개·보정", description: "질감 지우개·가장자리 정리", kind: "brush", tag: "지우개" },
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
      { id: "genre-palette", label: "장르 팔레트", description: "로맨스·판타지·스릴러·일상", kind: "palette", tag: "장르" },
      { id: "skin", label: "인물 색", description: "피부·머리·의상·그림자", kind: "palette", tag: "인물" },
      { id: "environment", label: "환경 색", description: "하늘·숲·도시·실내·야간", kind: "palette", tag: "환경" },
      { id: "grading", label: "색보정", description: "온도·대비·채도·필름 룩", kind: "filter", tag: "색보정" },
      { id: "atmosphere", label: "분위기 효과", description: "몽환·공포·회상·야간", kind: "filter", tag: "분위기" },
      { id: "finish", label: "마감 효과", description: "선화·망점·인쇄·샤픈", kind: "filter", tag: "마감" },
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
