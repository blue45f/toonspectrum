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
  Palette,
  Settings,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";

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

export const SITE_NAVIGATION_ITEMS = {
  home: item("home", "/", Home, "홈", "Home", "이어하기와 목적별 시작", "Continue work and start by goal", true),
  make: item("make", "/make", Palette, "새로 만들기", "New", "결과를 고르면 가장 알맞은 작업공간으로 안내", "Choose an outcome and open the right workspace"),
  studio: item("studio", "/studio/projects", Palette, "Studio", "Studio", "프로젝트를 열고 드로잉·레이어·3D·검수까지 제작", "Open projects and create with drawing, layers, 3D and review"),
  comic: item("comic", "/studio/comic", LayoutGrid, "컷툰 만들기", "Comic maker", "컷·말풍선·대사를 한 화면에서", "Arrange panels, dialogue and balloons"),
  shaper: item("shaper", "/shaper", UserRoundPen, "캐릭터 셰이퍼", "Character shaper", "캐릭터·포즈·구도를 입체적으로", "Shape characters, poses and composition"),
  market: item("market", "/market", Store, "에셋 마켓", "Asset market", "찾기·설치·배포까지 창작 에셋을 한곳에서", "Find, install and publish creative assets"),
  gallery: item("gallery", "/create", Images, "창작 갤러리", "Creator gallery", "다른 창작자의 작품과 제작 흐름", "Meet creators and their work"),
  explore: item("explore", "/discover", Compass, "찾기", "Discover", "검색·취향·추천·랭킹에서 원하는 방식으로 작품 발견", "Find stories through search, taste, recommendations or rankings"),
  ranking: item("ranking", "/ranking", TrendingUp, "통합 랭킹", "Rankings", "기간과 지표별 인기 흐름", "See trends across periods and signals"),
  calendar: item("calendar", "/calendar", CalendarDays, "연재 캘린더", "Release calendar", "요일별 신작과 연재 일정", "Track releases by day"),
  recommend: item("recommend", "/recommend", Sparkles, "맞춤 추천", "Recommendations", "지금 취향에 맞는 작품", "Find stories matched to your taste"),
  now: item("now", "/now", Lightbulb, "오늘의 영감", "Daily inspiration", "사물·공간·빛·소리로 시작하는 5컷", "A daily five-panel creative spark"),
  fortune: item("fortune", "/fortune", Moon, "사주·타로 운세", "Fortune & tarot", "오늘의 운세·별자리·사주·궁합·타로·독서 처방", "Explore daily fortune, zodiac, saju, compatibility, tarot and reading prescriptions"),
  research: item("research", "/research", BookOpen, "리서치 데스크", "Research desk", "출처가 있는 자료를 한 보드에", "Collect sourced references in one desk"),
  opportunities: item("opportunities", "/opportunities", Sparkles, "작가 기회센터", "Creator opportunities", "공모전·지원사업·제작 기회", "Find contests, programs and opportunities"),
  insights: item("insights", "/insights", BarChart3, "트렌드 인사이트", "Trend insights", "장르·플랫폼 흐름을 데이터로", "Read genre and platform trends"),
  reviews: item("reviews", "/reviews", MessageSquareQuote, "리뷰", "Reviews", "작품을 깊게 읽고 기록하기", "Read and write thoughtful reviews"),
  community: item("community", "/community", MessageCircle, "커뮤니티", "Community", "창작과 감상을 함께 나누기", "Share creation and discovery"),
  play: item("play", "/play", Gamepad2, "놀이터", "Playground", "가볍게 즐기는 인터랙티브 콘텐츠", "Enjoy playful interactive content"),
  library: item("library", "/library", Library, "내 서재", "My library", "저장한 작품과 취향을 한곳에서", "Keep saved stories and taste in one place"),
  me: item("me", "/my", UserRound, "내 공간", "My space", "프로젝트·작품·활동·프로필로 이동", "Open projects, works, activity and profile"),
  settings: item("settings", "/settings", Settings, "설정", "Settings", "언어·데이터·서비스 환경", "Language, data and service preferences"),
  help: item("help", "/help", BookOpen, "도움말", "Help", "작업과 문제에서 바로 해결 경로 찾기", "Find help from the task or problem"),
} as const satisfies Record<string, SiteNavigationItem>;

const I = SITE_NAVIGATION_ITEMS;

/** Production navigation: four durable destinations, regardless of feature count. */
export const TOONSTUDIO_PRIMARY_NAVIGATION = [
  I.studio,
  I.make,
  I.studioAssets,
  I.learn,
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
    id: "studio-work",
    label: { ko: "작업", en: "Work" },
    description: { ko: "시작하고 이어서 완성하기", en: "Start, continue and finish" },
    items: [I.studio, I.make, I.studioAssets, I.learn],
  },
  {
    id: "studio-create",
    label: { ko: "바로 만들기", en: "Quick create" },
    description: { ko: "결과에서 시작하는 제작 도구", en: "Production tools that start from an outcome" },
    items: [I.comic, I.shaper, I.research, I.now],
  },
  {
    id: "studio-ecosystem",
    label: { ko: "에셋·공개", en: "Assets & publishing" },
    description: { ko: "에셋을 찾고 결과를 세상과 연결", en: "Find assets and connect finished work to people" },
    items: [I.market, I.gallery, I.opportunities, I.insights],
  },
];

export const TOONSPECTRUM_NAVIGATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "discover",
    label: { ko: "작품 찾기", en: "Discover" },
    description: { ko: "취향과 흐름에서 다음 작품을", en: "Find the next story for your taste" },
    items: [I.explore, I.ranking, I.calendar, I.recommend],
  },
  {
    id: "grow",
    label: { ko: "자료·성장", en: "Research & grow" },
    description: { ko: "영감·자료·기회를 실제 작업으로", en: "Connect inspiration, research and opportunity" },
    items: [I.now, I.fortune, I.research, I.opportunities, I.insights],
  },
  {
    id: "connect",
    label: { ko: "함께 보기", en: "Connect" },
    description: { ko: "작품과 생각을 사람들과", en: "Share stories and ideas with people" },
    items: [I.gallery, I.reviews, I.community, I.play],
  },
  {
    id: "personal",
    label: { ko: "내 기록", en: "Personal" },
    description: { ko: "서재·활동·설정을 한곳에서", en: "Library, activity and settings in one place" },
    items: [I.library, I.me, I.insights, I.home],
  },
];

/** Compatibility export for the legacy all-menu consumer. */
export const SITE_NAVIGATION_GROUPS = TOONSPECTRUM_NAVIGATION_GROUPS;

export const TOONSTUDIO_MOBILE_TABS = [
  I.studio,
  I.make,
  I.studioAssets,
  I.learn,
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

const STUDIO_CONTEXT_PREFIXES = [
  "/studio",
  "/make",
  "/brush-lab",
  "/shaper",
  "/music",
  "/story-lab",
  "/publishing",
  "/research",
  "/opportunities",
  "/market",
  "/learn",
  "/help",
] as const;

/** Match a pathname against an exact route prefix or one of its descendants. */
function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Select the Studio or Spectrum navigation context for a pathname. */
export function siteNavigationContextForPath(pathname: string): SiteNavigationContext {
  return STUDIO_CONTEXT_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
    ? "studio"
    : "spectrum";
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

export function siteNavigationLocale(locale: string): SiteNavigationLocale {
  return locale.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export function siteNavigationText(text: SiteNavigationText, locale: string): string {
  return text[siteNavigationLocale(locale)];
}
