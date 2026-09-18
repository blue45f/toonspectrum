import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Compass,
  Gamepad2,
  Home,
  Images,
  LayoutGrid,
  Library,
  Lightbulb,
  MessageCircle,
  MessageSquareQuote,
  Moon,
  PackageCheck,
  Palette,
  Settings,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  UserRoundPen,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  primarySiteRouteAuthority,
  type SitePrimaryRouteId,
} from "@/shared/lib/site-route-authority";
import { resolveSiteRouteNavigationContext } from "@/shared/lib/site-route-metadata";
import { getActiveI18nLocale } from "@/shared/lib/i18n-bilingual-copy";



export type SiteNavigationLocale = "ko" | "en";
export type SiteNavigationContext = "studio" | "spectrum";
export type SiteNavigationText = Record<SiteNavigationLocale, string>;

export interface SiteNavigationItem {
  id: string;
  href: string;
  label: SiteNavigationText;
  description: SiteNavigationText;
  icon: LucideIcon;
  exact?: boolean;
}

export interface SiteNavigationGroup {
  id: string;
  label: SiteNavigationText;
  description: SiteNavigationText;
  items: readonly SiteNavigationItem[];
}

const item = (
  id: string,
  href: string,
  icon: LucideIcon,
  ko: string,
  en: string,
  koDescription: string,
  enDescription: string,
  exact = false,
): SiteNavigationItem => ({
  id,
  href,
  icon,
  exact,
  label: { ko, en },
  description: { ko: koDescription, en: enDescription },
});

const primaryItem = (
  id: string,
  routeId: SitePrimaryRouteId,
  icon: LucideIcon,
  exact = false,
): SiteNavigationItem => {
  const definition = primarySiteRouteAuthority(routeId);
  return item(
    id,
    definition.canonicalPath,
    icon,
    definition.label.ko,
    definition.label.en,
    definition.description.ko,
    definition.description.en,
    exact,
  );
};

export const SITE_NAVIGATION_ITEMS = {
  home: item(
    "home",
    "/",
    Home,
    "홈",
    "Home",
    "작품 탐색과 서비스 소개",
    "Discover stories and explore the service",
    true,
  ),
  production: primaryItem("production", "production", Workflow, true),
  make: primaryItem("make", "studio-new", Palette, true),
  studio: primaryItem("studio", "studio-home", Palette, true),
  studioAssets: primaryItem("studio-assets", "studio-assets", Store),
  publish: primaryItem("publish", "studio-publish", PackageCheck),
  learn: item(
    "learn",
    "/learn",
    BookOpen,
    "배우기",
    "Learn",
    "처음 시작부터 전문 제작과 문제 해결까지",
    "From first steps to professional workflows and troubleshooting",
  ),
  technology: item(
    "technology",
    "/about/technology",
    Workflow,
    "제작 기술",
    "Engineering",
    "제작 과정·아키텍처·오픈소스·적용 가이드",
    "Build process, architecture, open source and implementation guides",
  ),
  comic: item(
    "comic",
    "/studio/comic",
    LayoutGrid,
    "웹툰 만들기",
    "Webtoon",
    "컷·말풍선·대사를 한 화면에서",
    "Arrange panels, dialogue and balloons",
  ),
  shaper: item(
    "shaper",
    "/studio/assets/characters/new",
    UserRoundPen,
    "캐릭터 만들기",
    "Character",
    "캐릭터·표정·포즈와 3D 참고",
    "Build characters, expressions, poses and 3D reference",
  ),
  market: item(
    "market",
    "/market",
    Store,
    "소재 마켓",
    "Materials market",
    "호환성과 사용 권리를 확인하고 새 에셋 탐색",
    "Discover assets with compatibility and rights information",
  ),
  gallery: item(
    "gallery",
    "/showcase",
    Images,
    "창작 갤러리",
    "Showcase",
    "다른 창작자의 작품과 제작 흐름",
    "Meet creators and their work",
  ),
  explore: item(
    "explore",
    "/discover",
    Compass,
    "찾기",
    "Discover",
    "검색·취향·추천에서 원하는 작품 발견",
    "Find stories through search, taste and recommendations",
  ),
  ranking: item(
    "ranking",
    "/ranking",
    TrendingUp,
    "랭킹",
    "Rankings",
    "기간과 지표별 인기 흐름",
    "See trends across periods and signals",
  ),
  calendar: item(
    "calendar",
    "/calendar",
    CalendarDays,
    "연재 캘린더",
    "Release calendar",
    "요일별 신작과 연재 일정",
    "Track releases by day",
  ),
  recommend: item(
    "recommend",
    "/recommend",
    Sparkles,
    "맞춤 추천",
    "Recommendations",
    "지금 취향에 맞는 작품",
    "Find stories matched to your taste",
  ),
  now: item(
    "now",
    "/now",
    Lightbulb,
    "오늘의 영감",
    "Daily inspiration",
    "빈 화면의 부담을 줄이는 짧은 창작 시작",
    "A small creative prompt to overcome the blank page",
  ),
  fortune: item(
    "fortune",
    "/fortune",
    Moon,
    "사주·타로 운세",
    "Fortune & tarot",
    "오늘의 운세·별자리·사주·궁합·타로·독서 처방",
    "Explore daily fortune, zodiac, saju, compatibility, tarot and reading prescriptions",
  ),
  research: item(
    "research",
    "/research",
    BookOpen,
    "참고자료",
    "References",
    "출처가 있는 자료를 한곳에",
    "Collect sourced references in one place",
  ),
  opportunities: item(
    "opportunities",
    "/opportunities",
    Sparkles,
    "창작 기회",
    "Opportunities",
    "공모전·지원사업·제작 기회",
    "Find contests, programs and opportunities",
  ),
  insights: item(
    "insights",
    "/insights",
    BarChart3,
    "트렌드",
    "Trends",
    "장르·플랫폼 흐름을 데이터로",
    "Read genre and platform trends",
  ),
  reviews: item(
    "reviews",
    "/reviews",
    MessageSquareQuote,
    "리뷰",
    "Reviews",
    "작품을 깊게 읽고 기록하기",
    "Read and write thoughtful reviews",
  ),
  collaborate: item("collaborate", "/collaborate", MessageCircle, "구인·의뢰", "Collaborate", "웹툰 팀원 모집·작업 의뢰·작업자 홍보", "Find teammates, commission work and share your skills"),
  community: item(
    "community",
    "/community",
    MessageCircle,
    "커뮤니티",
    "Community",
    "창작과 감상을 함께 나누기",
    "Share creation and discovery",
  ),
  play: item(
    "play",
    "/play",
    Gamepad2,
    "놀이터",
    "Playground",
    "가볍게 즐기는 인터랙티브 콘텐츠",
    "Enjoy playful interactive content",
  ),
  library: item(
    "library",
    "/library",
    Library,
    "내 서재",
    "My library",
    "저장한 작품과 취향을 한곳에서",
    "Keep saved stories and taste in one place",
  ),
  me: item(
    "me",
    "/my",
    UserRound,
    "내 공간",
    "My space",
    "작품·활동·프로필과 계정 관리",
    "Works, activity, profile and account",
  ),
  settings: item(
    "settings",
    "/settings",
    Settings,
    "설정",
    "Settings",
    "언어·데이터·서비스 환경",
    "Language, data and service preferences",
  ),
  help: item(
    "help",
    "/help",
    BookOpen,
    "도움말",
    "Help",
    "작업과 문제에서 바로 해결 경로 찾기",
    "Find help from the task or problem",
  ),
} as const satisfies Record<string, SiteNavigationItem>;

const I = SITE_NAVIGATION_ITEMS;

/** Production navigation: four durable destinations, regardless of feature count. */
export const TOONSTUDIO_PRIMARY_NAVIGATION = [
  I.production,
  I.studio,
  I.studioAssets,
  I.publish,
] as const;

/** Reader navigation remains separate from the creation product. */
export const TOONSPECTRUM_PRIMARY_NAVIGATION = [
  I.explore,
  I.ranking,
  I.community,
  I.library,
] as const;

/** Compatibility export for consumers not yet context-aware. */
export const PRIMARY_SITE_NAVIGATION = TOONSPECTRUM_PRIMARY_NAVIGATION;

export const TOONSTUDIO_NAVIGATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "production-flow",
    label: { ko: "제작 흐름", en: "Production flow" },
    description: { ko: "작품 전체를 계획하고 오늘 할 일을 바로 확인", en: "Plan the whole work and see what needs attention today" },
    items: [I.production, I.studio, I.make],
  },
  {
    id: "production-resources",
    label: { ko: "작품 준비", en: "Prepare the work" },
    description: {
      ko: "작품 재료와 참고자료를 작업 가까이에",
      en: "Keep assets and references close to the work",
    },
    items: [I.studioAssets, I.research, I.learn, I.technology],
  },
  {
    id: "production-delivery",
    label: { ko: "완성·협업", en: "Finish & collaborate" },
    description: {
      ko: "검수하고 내보내고 함께할 사람과 연결",
      en: "Review, export and connect with collaborators",
    },
    items: [I.publish, I.collaborate, I.gallery, I.community],
  },
];

export const TOONSPECTRUM_NAVIGATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "discover",
    label: { ko: "작품 찾기", en: "Discover" },
    description: {
      ko: "취향과 흐름에서 다음 작품을",
      en: "Find the next story for your taste",
    },
    items: [I.explore, I.ranking, I.calendar, I.recommend],
  },
  {
    id: "grow",
    label: { ko: "자료·성장", en: "Research & grow" },
    description: {
      ko: "영감·자료·기회를 실제 작업으로",
      en: "Connect inspiration, research and opportunity",
    },
    items: [I.now, I.fortune, I.research, I.opportunities, I.insights, I.technology],
  },
  {
    id: "connect",
    label: { ko: "함께 보기", en: "Connect" },
    description: {
      ko: "작품과 생각을 사람들과",
      en: "Share stories and ideas with people",
    },
    items: [I.gallery, I.reviews, I.community, I.collaborate, I.play],
  },
  {
    id: "personal",
    label: { ko: "내 기록", en: "Personal" },
    description: {
      ko: "서재·활동·설정을 한곳에서",
      en: "Library, activity and settings in one place",
    },
    items: [I.library, I.me, I.home],
  },
];

/** Compatibility export for the legacy all-menu consumer. */
export const SITE_NAVIGATION_GROUPS = TOONSPECTRUM_NAVIGATION_GROUPS;

export const TOONSTUDIO_MOBILE_TABS = [
  I.production,
  I.studio,
  I.make,
  I.studioAssets,
  I.me,
] as const;

export const TOONSPECTRUM_MOBILE_TABS = [
  I.home,
  I.explore,
  I.ranking,
  I.community,
  I.library,
] as const;

/** Compatibility export for consumers not yet context-aware. */
export const MOBILE_SITE_TABS = TOONSPECTRUM_MOBILE_TABS;

export const SITE_UTILITY_NAVIGATION = [I.help, I.settings, I.me] as const;

/** Select the Studio or Spectrum navigation context from the canonical route metadata projection. */
export function siteNavigationContextForPath(pathname: string): SiteNavigationContext {
  return resolveSiteRouteNavigationContext(pathname);
}

/** Return the primary navigation destinations for the pathname's product context. */
export function primarySiteNavigationForPath(pathname: string): readonly SiteNavigationItem[] {
  return siteNavigationContextForPath(pathname) === "studio"
    ? TOONSTUDIO_PRIMARY_NAVIGATION
    : TOONSPECTRUM_PRIMARY_NAVIGATION;
}

/** Return grouped drawer navigation for the pathname's product context. */
export function siteNavigationGroupsForPath(pathname: string): readonly SiteNavigationGroup[] {
  return siteNavigationContextForPath(pathname) === "studio"
    ? TOONSTUDIO_NAVIGATION_GROUPS
    : TOONSPECTRUM_NAVIGATION_GROUPS;
}

/** Return stable mobile tabs for the pathname's product context. */
export function mobileSiteTabsForPath(pathname: string): readonly SiteNavigationItem[] {
  return siteNavigationContextForPath(pathname) === "studio"
    ? TOONSTUDIO_MOBILE_TABS
    : TOONSPECTRUM_MOBILE_TABS;
}

export function siteNavigationLocale(_locale): SiteNavigationLocale {
  return getActiveI18nLocale();
}

export function siteNavigationText(text: SiteNavigationText, locale: string): string {
  return text[siteNavigationLocale(locale)];
}
