import {
  Archive,
  Boxes,
  CloudSun,
  Database,
  Landmark,
  Library,
  Music,
  PaintBucket,
  PawPrint,
  Rocket,
  Shirt,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { ResourceProvider } from "@/shared/lib/creator-resources";

import { OPEN_DATA_PROVIDERS } from "./resource-search-config";

type Bilingual = readonly [ko: string, en: string];

/**
 * 자료 이용 조건 묶음 — 타일 배지와 라이선스 안내 한 줄이 같은 단어를 쓰도록 한곳에 둔다.
 * 세부 조건은 언제나 각 결과의 원문이 최종 기준이다.
 */
export type ResearchUsage = "cc0" | "attribution" | "reference" | "metadata" | "mixed";

/** 타일 배지용 짧은 이름 — 자세한 뜻은 데스크의 라이선스 안내 한 줄과 `/about/data`에서 설명한다. */
export const RESEARCH_USAGE_LABELS: Readonly<Record<ResearchUsage, Bilingual>> = {
  cc0: ["CC0", "CC0"],
  attribution: ["출처 표시", "Credit"],
  reference: ["참고용", "Reference"],
  metadata: ["정보 조사", "Facts"],
  mixed: ["항목별 확인", "Per item"],
};

/** 이용 조건 한 줄 안내의 각 낱말 설명 — 타일 배지와 같은 단어를 쓴다. */
export const RESEARCH_USAGE_HINTS: Readonly<Record<Exclude<ResearchUsage, "mixed">, Bilingual>> = {
  cc0: ["상업 작품에도 사용", "usable in commercial work"],
  attribution: ["출처를 밝히면 사용", "usable with credit"],
  reference: ["보고 그리는 참고용", "for drawing from only"],
  metadata: ["작품·서지 정보 조사", "facts and bibliographic lookups"],
};

export interface ResearchCategory {
  readonly id: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: Bilingual;
  /** 타일에 쓰는 한 줄 설명 — 모바일 2열에서도 두 줄 안에 들어가도록 짧게. */
  readonly description: Bilingual;
  /** 실제로 검색하는 제공처. 타일의 "출처 N곳"은 이 배열 길이에서 계산한다. */
  readonly providers: readonly ResourceProvider[];
  readonly usage: ResearchUsage;
}

/**
 * 리서치 데스크 첫 화면의 "무엇을 찾을 수 있나요" 타일 — 실제 검색 화면이 있는 범주만 둔다.
 * 순서는 웹툰 제작에서 자주 쓰는 순서(장면 고증 → 배경 재료 → 레터링 → 설정 자료)다.
 */
export const RESEARCH_CATEGORIES: readonly ResearchCategory[] = [
  {
    id: "references",
    href: "/research/assets",
    icon: Landmark,
    title: ["레퍼런스 아틀라스", "Reference atlas"],
    description: ["복식·소품·건축 미술관 자료", "Museum costume, props & architecture"],
    providers: ["met"],
    usage: "cc0",
  },
  {
    id: "3d",
    href: "/research/3d-assets",
    icon: Boxes,
    title: ["3D 모델·HDRI", "3D models & HDRI"],
    description: ["배경 조명·소품 모델·텍스처", "Lighting, prop models & textures"],
    providers: ["polyhaven"],
    usage: "cc0",
  },
  {
    id: "materials",
    href: "/research/material-assets",
    icon: PaintBucket,
    title: ["CC0 PBR 재질", "CC0 PBR materials"],
    description: ["벽돌·나무·천 재질과 지형", "Brick, wood, fabric & terrain"],
    providers: ["ambientcg"],
    usage: "cc0",
  },
  {
    id: "fonts",
    href: "/research/fonts",
    icon: Type,
    title: ["폰트·레터링", "Fonts & lettering"],
    description: ["한글 글꼴을 대사로 미리보기", "Preview Korean fonts on your lines"],
    providers: ["googlefonts"],
    usage: "mixed",
  },
  {
    id: "editions",
    href: "/research/books",
    icon: Library,
    title: ["판본·원작", "Editions & originals"],
    description: ["작품명·작가·ISBN 서지 조사", "Title, author & ISBN lookups"],
    providers: ["openlibrary", "googlebooks", "openbd"],
    usage: "metadata",
  },
  {
    id: "fashion",
    href: "/research/vam",
    icon: Shirt,
    title: ["패션·시대 고증", "Fashion & period detail"],
    description: ["복식·직물·가구·장식미술", "Costume, textile, furniture & décor"],
    providers: ["vam", "rijksmuseum"],
    usage: "reference",
  },
  {
    id: "creatures",
    href: "/research/creatures",
    icon: PawPrint,
    title: ["크리처·생물 도감", "Creatures & species"],
    description: ["종·서식지 근거로 크리처 설계", "Design creatures from real species"],
    providers: ["gbif"],
    usage: "reference",
  },
  {
    id: "weather",
    href: "/research/weather-light",
    icon: CloudSun,
    title: ["날씨·빛 연출", "Weather & light"],
    description: ["장소별 구름·습도·빛 연속성", "Clouds, humidity & light by place"],
    providers: ["metweather"],
    usage: "attribution",
  },
  {
    id: "music",
    href: "/research/music-metadata",
    icon: Music,
    title: ["음악 메타데이터", "Music metadata"],
    description: ["BGM 레퍼런스용 음악가 정보", "Artist facts for BGM references"],
    providers: ["musicbrainz"],
    usage: "metadata",
  },
  {
    id: "space",
    href: "/research/space-assets",
    icon: Rocket,
    title: ["우주·과학 이미지", "Space & science"],
    description: ["행성·우주선·성운 레퍼런스", "Planets, spacecraft & nebulae"],
    providers: ["nasa"],
    usage: "reference",
  },
  {
    id: "archive",
    href: "/research/archive",
    icon: Archive,
    title: ["역사 아카이브", "History archive"],
    description: ["옛 사진·신문·잡지 원문 링크", "Old photos, papers & magazines"],
    providers: ["internetarchive"],
    usage: "reference",
  },
  {
    id: "open-data",
    href: "/research/open-data",
    icon: Database,
    title: ["공개 데이터", "Open data"],
    description: ["국가유산·장소·사전 등 공식 API", "Heritage, places, dictionary APIs"],
    providers: [...OPEN_DATA_PROVIDERS],
    usage: "mixed",
  },
];

export interface ResearchRecipeStep {
  readonly label: Bilingual;
  readonly href: string;
}

export interface ResearchRecipe {
  readonly id: string;
  readonly title: Bilingual;
  readonly outcome: Bilingual;
  /** 카드 썸네일 — 브랜드 일러스트(실제 결과물이 아님을 카드에 함께 적는다). */
  readonly art: string;
  readonly steps: readonly ResearchRecipeStep[];
  /** 자료를 모은 뒤 이어지는 제작 화면. Studio 경로는 문서 이동으로 연다. */
  readonly finish: { readonly label: Bilingual; readonly href: string };
}

const search = (path: string, query: string): string => `${path}?q=${encodeURIComponent(query)}&page=1`;

/**
 * 작업별 추천 조합 — "무엇을 만들려는지"에서 출발해 필요한 자료 2~3가지를 순서대로 열고
 * 바로 제작 화면으로 이어지게 한다. 각 단계는 해당 검색 화면을 예시 검색어와 함께 연다.
 */
export const RESEARCH_RECIPES: readonly ResearchRecipe[] = [
  {
    id: "bg3d",
    title: ["3D 배경 세트", "3D background set"],
    outcome: ["HDRI 조명 + PBR 재질 + 소품 모델로 배경 컷의 바탕을 만듭니다.", "HDRI light, PBR materials and prop models for a background base."],
    art: "/brand/illustrated-20260928/background-city-320.webp",
    steps: [
      { label: ["HDRI 조명", "HDRI light"], href: search("/research/3d-assets", "sunset") },
      { label: ["PBR 재질", "PBR material"], href: search("/research/material-assets", "brick") },
      { label: ["소품 모델", "Prop model"], href: search("/research/3d-assets", "chair") },
    ],
    finish: { label: ["3D 배경에서 조립", "Assemble in 3D background"], href: "/studio/bg3d" },
  },
  {
    id: "period",
    title: ["시대극 장면 고증", "Period scene research"],
    outcome: ["복식·직물·장소 근거를 모아 의상과 배경의 시대감을 맞춥니다.", "Match costume and setting to the era with sourced evidence."],
    art: "/brand/illustrated-20260928/canvas-noir-320.webp",
    steps: [
      { label: ["복식 레퍼런스", "Costume reference"], href: search("/research/assets", "costume") },
      { label: ["직물·장식", "Textile & décor"], href: search("/research/vam", "textile") },
      { label: ["국가유산 장소", "Heritage site"], href: search("/research/open-data/kheritage", "경복궁") },
    ],
    finish: { label: ["콘티로 옮기기", "Move into storyboard"], href: "/studio/new" },
  },
  {
    id: "lettering",
    title: ["말풍선·타이틀 레터링", "Balloon & title lettering"],
    outcome: ["대사 톤에 맞는 한글 글꼴과 말투 어휘를 함께 고릅니다.", "Pick Korean fonts and wording that fit each voice."],
    art: "/brand/illustrated-20260928/character-pink-320.webp",
    steps: [
      { label: ["손글씨 글꼴", "Handwritten fonts"], href: search("/research/fonts", "손글씨") },
      { label: ["말투 어휘", "Voice vocabulary"], href: search("/research/open-data/korean", "능청스럽다") },
    ],
    finish: { label: ["편집기에서 말풍선 넣기", "Add balloons in the editor"], href: "/studio/new" },
  },
  {
    id: "creature",
    title: ["판타지 크리처 설계", "Fantasy creature design"],
    outcome: ["실제 생물의 형태와 서식 환경을 섞어 설득력 있는 크리처를 만듭니다.", "Blend real anatomy and habitat into a believable creature."],
    art: "/brand/illustrated-20260928/character-blue-320.webp",
    steps: [
      { label: ["생물 도감", "Species guide"], href: search("/research/creatures", "여우") },
      { label: ["서식지 빛·날씨", "Habitat light"], href: search("/research/weather-light", "제주") },
    ],
    finish: { label: ["캐릭터로 만들기", "Turn into a character"], href: "/studio/assets/characters/new" },
  },
];

/** 범주 타일에 함께 보여 줄 "이 브라우저에 저장한 자료 수" — 제공처별 집계에서 합산한다. */
export function savedCountForCategory(
  category: ResearchCategory,
  breakdown: readonly { readonly provider: ResourceProvider; readonly count: number }[],
): number {
  const providers = new Set<ResourceProvider>(category.providers);
  return breakdown.reduce((sum, entry) => (providers.has(entry.provider) ? sum + entry.count : sum), 0);
}
