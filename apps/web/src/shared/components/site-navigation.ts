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
  make: item("make", "/make", Palette, "만들기", "Create", "프로젝트·캔버스·캐릭터·자료에서 시작", "Start from projects, canvases, characters or references"),
  studio: item("studio", "/studio", Palette, "스튜디오", "Studio", "드로잉·레이어·필터 작업", "Draw with brushes, layers and filters"),
  comic: item("comic", "/studio/comic", LayoutGrid, "컷툰 만들기", "Comic maker", "컷·말풍선·대사를 한 화면에서", "Arrange panels, dialogue and balloons"),
  shaper: item("shaper", "/shaper", UserRoundPen, "캐릭터 셰이퍼", "Character shaper", "캐릭터·포즈·구도를 입체적으로", "Shape characters, poses and composition"),
  market: item("market", "/market", Store, "에셋 마켓", "Asset market", "배경·소품·템플릿을 작업에 연결", "Find backgrounds, props and templates"),
  gallery: item("gallery", "/create", Images, "창작 갤러리", "Creator gallery", "다른 창작자의 작품과 제작 흐름", "Meet creators and their work"),
  explore: item("explore", "/explore", Compass, "찾기", "Discover", "장르와 취향으로 다음 작품 발견", "Discover stories by genre and taste"),
  ranking: item("ranking", "/ranking", TrendingUp, "통합 랭킹", "Rankings", "기간과 지표별 인기 흐름", "See trends across periods and signals"),
  calendar: item("calendar", "/calendar", CalendarDays, "연재 캘린더", "Release calendar", "요일별 신작과 연재 일정", "Track releases by day"),
  recommend: item("recommend", "/recommend", Sparkles, "맞춤 추천", "Recommendations", "지금 취향에 맞는 작품", "Find stories matched to your taste"),
  now: item("now", "/now", Lightbulb, "오늘의 영감", "Daily inspiration", "사물·공간·빛·소리로 시작하는 5컷", "A daily five-panel creative spark"),
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

/**
 * Desktop keeps four conventional destinations; the purpose-first Create action
 * is rendered as the visually distinct header CTA so the top-level model stays
 * at five choices rather than turning into another feature strip.
 */
export const PRIMARY_SITE_NAVIGATION = [
  I.home,
  I.explore,
  I.community,
  I.me,
] as const;

export const SITE_NAVIGATION_GROUPS: readonly SiteNavigationGroup[] = [
  {
    id: "create",
    label: { ko: "만들기", en: "Create" },
    description: { ko: "결과를 고르고 필요한 작업공간으로", en: "Choose an outcome and open the right workspace" },
    items: [I.make, I.studio, I.comic, I.shaper, I.market],
  },
  {
    id: "discover",
    label: { ko: "찾기", en: "Discover" },
    description: { ko: "취향과 흐름에서 다음 작품을", en: "Find the next story for your taste" },
    items: [I.explore, I.ranking, I.calendar, I.recommend],
  },
  {
    id: "grow",
    label: { ko: "자료·성장", en: "Research & grow" },
    description: { ko: "영감·자료·기회를 실제 작업으로", en: "Connect inspiration, research and opportunity" },
    items: [I.now, I.research, I.opportunities, I.insights],
  },
  {
    id: "connect",
    label: { ko: "함께하기", en: "Connect" },
    description: { ko: "작품과 생각을 사람들과", en: "Share work and ideas with people" },
    items: [I.gallery, I.reviews, I.community, I.play],
  },
] as const;

export const MOBILE_SITE_TABS = [
  I.home,
  I.explore,
  I.make,
  I.community,
  I.me,
] as const;

export const SITE_UTILITY_NAVIGATION = [I.help, I.settings, I.library] as const;

export function siteNavigationLocale(locale: string): SiteNavigationLocale {
  return locale.toLowerCase().split(/[-_]/)[0] === "ko" ? "ko" : "en";
}

export function siteNavigationText(text: SiteNavigationText, locale: string): string {
  return text[siteNavigationLocale(locale)];
}
