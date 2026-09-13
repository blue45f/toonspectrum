import {
  Crown,
  Cuboid,
  GraduationCap,
  Swords,
  type LucideIcon,
} from "lucide-react";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export interface MarketCuratedTheme {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  /** Primary discovery tag when `browseHref` is omitted. */
  readonly tag: string;
  /** Concrete browse destination verified against the public catalog shape. */
  readonly browseHref: string;
  readonly badge: string;
  readonly icon: LucideIcon;
  readonly gradient: string;
  readonly accentColor: string;
  readonly image: string;
}

/**
 * Homepage collection cards must deep-link into non-empty public destinations.
 * Live catalog (2026-09-13) is CC0 seed-heavy: tags like 로판/무기/인체/회차 resolve empty,
 * while 소품·학교·배경·3D and kind=3d-asset return rows.
 */
export const MARKET_CURATED_THEMES: readonly MarketCuratedTheme[] = [
  {
    id: "rofan-royal",
    title: "장면을 채우는 소품",
    subtitle: "소파·원탁·화병·선반 등 바로 놓는 가구",
    description: "공개 카탈로그에 있는 CC0 소품으로 실내 컷의 소도구를 빠르게 채우세요. 장르 전용 로판 팩이 추가되면 이 자리에서 이어집니다.",
    tag: "소품",
    browseHref: "/market/browse?tag=%EC%86%8C%ED%92%88",
    badge: "소품·가구",
    image: "/brand/atelier-world.webp",
    icon: Crown,
    gradient: "from-pink-500/20 via-purple-500/10 to-amber-500/20",
    accentColor: "#ec4899",
  },
  {
    id: "school-youth",
    title: "청춘이 머무는 교실",
    subtitle: "학교·교실 태그의 공개 리소스",
    description: "학원물 장면에 맞는 학교·교실 태그 리소스를 모았습니다. 공개된 항목부터 바로 살펴보세요.",
    tag: "학교",
    browseHref: "/market/browse?tag=%ED%95%99%EA%B5%90",
    badge: "학교·일상",
    image: "/assets/studio/backgrounds/webtoon_classroom.jpg",
    icon: GraduationCap,
    gradient: "from-sky-500/20 via-blue-500/10 to-emerald-500/20",
    accentColor: "#0284c7",
  },
  {
    id: "action-fantasy",
    title: "한 컷에 담는 3D",
    subtitle: "카메라를 돌릴 수 있는 3D 에셋",
    description: "공개 중인 3D 에셋으로 구도와 소품 배치를 먼저 잡으세요. 무기·액션 전용 팩은 카탈로그에 추가되는 대로 연결됩니다.",
    tag: "3D",
    browseHref: "/market/browse?kind=3d-asset",
    badge: "3D·구도",
    image: "/assets/studio/backgrounds/webtoon_action_ruined_city.jpg",
    icon: Swords,
    gradient: "from-amber-500/20 via-red-500/10 to-orange-500/20",
    accentColor: "#ea580c",
  },
  {
    id: "pose-guide-3d",
    title: "배경으로 잡는 공간감",
    subtitle: "실내·공원 등 공개 배경 리소스",
    description: "투시와 공간감을 확인할 수 있는 공개 배경 리소스부터 살펴보세요. 인체·포즈 전용 팩이 생기면 이 카드가 그 목록으로 이어집니다.",
    tag: "배경",
    browseHref: "/market/browse?tag=%EB%B0%B0%EA%B2%BD",
    badge: "배경·공간",
    image: "/brand/atelier-materials.webp",
    icon: Cuboid,
    gradient: "from-teal-500/20 via-cyan-500/10 to-emerald-500/20",
    accentColor: "#0d9488",
  },
] as const;

export function filterThemeResources(
  items: readonly CreatorMarketplaceResourceRecord[],
  themeTag: string,
): readonly CreatorMarketplaceResourceRecord[] {
  return items.filter((item) =>
    item.tags.some((t) => t.toLowerCase() === themeTag.toLowerCase()),
  );
}
