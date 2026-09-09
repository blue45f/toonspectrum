import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationLocale,
  siteNavigationText,
  type SiteNavigationText,
} from "@/shared/components/site-navigation";
import { Container } from "@/shared/components/section";
import { useI18n, useT } from "@/shared/lib/i18n";
import Link from "@/compat/router-link";

interface ExtendedDestination {
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
}

interface ExtendedDestinationGroup {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly items: readonly ExtendedDestination[];
}

const destination = (
  href: string,
  ko: string,
  en: string,
  koDescription: string,
  enDescription: string,
): ExtendedDestination => ({
  href,
  label: { ko, en },
  description: { ko: koDescription, en: enDescription },
});

const EXTENDED_DESTINATION_GROUPS: readonly ExtendedDestinationGroup[] = [
  {
    id: "creative-tools",
    icon: Wrench,
    label: { ko: "제작 도구 더보기", en: "More creative tools" },
    description: {
      ko: "표현을 확장하고 제작 과정을 익히는 전문 도구",
      en: "Specialized tools for expanding expression and learning the workflow",
    },
    items: [
      destination("/brush-lab", "브러시 연구실", "Brush lab", "브러시를 만들고 시험하기", "Build and test custom brushes"),
      destination("/music", "음악·사운드", "Music & sound", "작품에 연결할 음원 만들기", "Create audio for your work"),
      destination("/learn", "웹툰 제작 강좌", "Creation courses", "기초부터 스튜디오 실습까지", "Learn from foundations to studio practice"),
      destination("/learn/glossary", "웹툰 용어 사전", "Creation glossary", "제작 용어와 예시 빠르게 찾기", "Find production terms and examples"),
      destination("/learn/recipes", "제작 레시피", "Creative recipes", "연출을 직접 조작하며 학습", "Learn direction through hands-on recipes"),
      destination("/story-lab", "스토리 연구실", "Story lab", "인물·욕망·갈등 설계", "Shape characters, desire and conflict"),
      destination("/publishing", "연재·출판 준비", "Publishing prep", "원고·권리·소개 자료 점검", "Check manuscripts, rights and pitch materials"),
    ],
  },
  {
    id: "collections",
    icon: BookOpen,
    label: { ko: "작품·에셋 관리", en: "Work & asset management" },
    description: {
      ko: "공개 작품과 제작 재료를 더 세밀하게 관리",
      en: "Manage published work and creative materials in more detail",
    },
    items: [
      destination("/create/challenges", "창작 챌린지", "Creative challenges", "주제별 창작 이벤트", "Join themed creative events"),
      destination("/authors", "작가별 보기", "Browse creators", "작가와 대표 작품 탐색", "Explore creators and representative work"),
      destination("/market/browse", "에셋 상세 탐색", "Browse assets", "종류·사용권으로 리소스 찾기", "Find resources by type and license"),
      destination("/market/library", "내 에셋", "My assets", "획득한 리소스 관리", "Manage acquired resources"),
      destination("/market/wishlist", "찜한 에셋", "Saved assets", "나중에 사용할 리소스", "Keep resources for later"),
      destination("/references", "작품 레퍼런스", "Story references", "공식 자료 탐색과 연구 노트", "Explore official sources and notes"),
      destination("/research/books", "글로벌 판본 탐색", "Global editions", "Open Library·openBD 메타데이터 검색", "Search Open Library and openBD metadata"),
    ],
  },
  {
    id: "data-discovery",
    icon: Database,
    label: { ko: "검색·데이터 도구", en: "Search & data tools" },
    description: {
      ko: "작품을 비교하고 태그와 데이터로 더 깊게 탐색",
      en: "Compare stories and explore more deeply through tags and data",
    },
    items: [
      destination("/search", "통합 검색", "Unified search", "작품·작가·태그 검색", "Search stories, creators and tags"),
      destination("/compare", "작품 비교", "Compare stories", "두 작품의 주요 지표 비교", "Compare key signals across two stories"),
      destination("/random", "랜덤 발견", "Random discovery", "조건에 맞는 작품 무작위 추천", "Discover a random matching story"),
      destination("/tags", "태그로 찾기", "Explore tags", "인기·유사 태그 탐색", "Explore popular and related tags"),
      destination("/news", "업계 소식", "Industry news", "웹툰·웹소설 관련 소식", "Follow webtoon and web novel news"),
    ],
  },
  {
    id: "participation",
    icon: UsersRound,
    label: { ko: "참여·피드백", en: "Participation & feedback" },
    description: {
      ko: "관심사를 함께 나누고 서비스 개선에 참여",
      en: "Share interests with others and help improve the service",
    },
    items: [
      destination("/community/cafes", "장르 카페", "Genre cafés", "관심 장르별 모임과 대화", "Meet and talk around favorite genres"),
      destination("/feedback", "제보·제안", "Feedback", "버그·아이디어·기능 요청", "Report bugs and suggest ideas or features"),
    ],
  },
  {
    id: "help-policy",
    icon: ShieldCheck,
    label: { ko: "안내·지원·정책", en: "Help, support & policy" },
    description: {
      ko: "서비스 원칙과 데이터 출처, 문의 및 권리 정책",
      en: "Service principles, data sources, support and rights policies",
    },
    items: [
      destination("/about", "서비스 소개", "About ToonStudio", "기능과 운영 원칙", "Features and operating principles"),
      destination("/about/data", "데이터 출처", "Data sources", "공급자별 연결·이용 준비 상태", "Provider connections and readiness"),
      destination("/about/crawler", "공개 데이터 수집 정책", "Public data policy", "자동수집 원칙·제외·중지 요청", "Collection rules, exclusions and opt-out"),
      destination("/guide", "랭킹 산정 방식", "Ranking guide", "데이터와 산식 설명", "Understand ranking data and formulas"),
      destination("/support", "이용 문의", "Support", "서비스 이용 도움받기", "Get help using the service"),
      destination("/contact", "광고·제휴", "Business contact", "광고와 파트너십 문의", "Advertising and partnership inquiries"),
      destination("/copyright", "저작권 안내", "Copyright", "콘텐츠·권리 정책", "Content and rights policy"),
      destination("/terms", "이용약관", "Terms", "서비스 이용 조건", "Terms of service"),
      destination("/privacy", "개인정보처리방침", "Privacy", "개인정보 처리 기준", "Privacy practices"),
    ],
  },
];

const PAGE_COPY = {
  ko: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "하고 싶은 일에서\n바로 시작하세요.",
    description: "기능 이름을 찾기보다 만들기, 발견하기, 성장하기, 함께하기 중 지금의 목적을 고르세요. 전문 도구와 정책은 아래 보조 탐색에서 이어집니다.",
    search: "작품·도구·메뉴 검색",
    core: "핵심 작업 흐름",
    coreDescription: "자주 쓰는 목적지를 창작 여정에 맞춰 네 갈래로 정리했습니다.",
    personal: "내 공간과 환경",
    extended: "더 세밀하게 찾기",
    extendedDescription: "특정 도구, 관리 화면, 데이터와 정책이 필요할 때 이용하세요.",
    home: "메인으로 돌아가기",
  },
  en: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "Start with what\nyou want to do.",
    description: "Choose your current purpose—create, discover, grow or connect—instead of hunting for a feature name. Specialized tools and policies continue below.",
    search: "Search stories, tools and menus",
    core: "Core creative flow",
    coreDescription: "Frequent destinations are organized into four paths that follow the creative journey.",
    personal: "Your space and preferences",
    extended: "Find something specific",
    extendedDescription: "Use these paths when you need a specialist tool, management screen, data or policy.",
    home: "Back to home",
  },
} as const;

export function SitemapPage() {
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const copy = PAGE_COPY[locale];
  const t = useT();
  const personalDestinations = [SITE_NAVIGATION_ITEMS.me, ...SITE_UTILITY_NAVIGATION] as const;

  return (
    <Container size="wide" className="py-6 sm:py-10 lg:py-14">
      <section
        className="relative overflow-hidden rounded-[1.75rem] border border-line/70 bg-gradient-to-br from-panel via-card to-raised/70 p-6 shadow-lg sm:p-9 lg:p-12"
        aria-labelledby="sitemap-title"
      >
        <span aria-hidden="true" className="absolute -right-20 -top-24 size-72 rounded-full border border-accent/20" />
        <span aria-hidden="true" className="absolute -right-6 -top-8 size-40 rounded-full border border-line-strong/45" />
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 font-display text-[0.66rem] font-bold uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" />{copy.eyebrow}
          </p>
          <h1
            id="sitemap-title"
            className="mt-4 whitespace-pre-line font-display text-[clamp(2.35rem,7vw,4.75rem)] font-bold leading-[0.98] tracking-[-0.06em] text-fg [text-wrap:balance]"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
            {copy.description}
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/search"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2.5 text-sm font-bold text-canvas shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Search size={17} aria-hidden="true" />{copy.search}
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-card/80 px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              {copy.home}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="sitemap-core-title">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">01 · PRIMARY PATHS</p>
            <h2 id="sitemap-core-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
              {copy.core}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">{copy.coreDescription}</p>
          </div>
          <span className="hidden font-display text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-fg-3 sm:block">
            Create · Share · Discover
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {SITE_NAVIGATION_GROUPS.map((group, groupIndex) => (
            <section
              key={group.id}
              className="rounded-3xl border border-line/70 bg-panel/45 p-4 shadow-sm sm:p-5"
              aria-labelledby={`sitemap-${group.id}`}
            >
              <div className="flex items-start gap-3 px-1 pb-4 sm:px-2">
                <span aria-hidden="true" className="pt-0.5 font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent">
                  0{groupIndex + 1}
                </span>
                <div>
                  <h3 id={`sitemap-${group.id}`} className="font-display text-lg font-bold text-fg">
                    {siteNavigationText(group.label, locale)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-fg-3">
                    {siteNavigationText(group.description, locale)}
                  </p>
                </div>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex min-h-[6.25rem] h-full items-start gap-3 rounded-2xl border border-line bg-card/75 p-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/30 group-hover:text-accent">
                          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 pt-0.5">
                          <strong className="block text-sm font-bold text-fg transition-colors group-hover:text-accent">
                            {siteNavigationText(item.label, locale)}
                          </strong>
                          <span className="mt-1 block text-xs leading-5 text-fg-3">
                            {siteNavigationText(item.description, locale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section
        className="mt-6 rounded-3xl border border-line/70 bg-gradient-to-r from-accent-soft/70 via-panel/70 to-panel/40 p-4 sm:p-5"
        aria-labelledby="sitemap-personal-title"
      >
        <div className="mb-4 flex items-center gap-3 px-1 sm:px-2">
          <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-card/70 text-accent">
            <UserRound size={17} aria-hidden="true" />
          </span>
          <h2 id="sitemap-personal-title" className="font-display text-base font-bold text-fg">{copy.personal}</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {personalDestinations.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="group flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-card/75 px-4 py-3 text-sm font-bold text-fg-2 transition-colors hover:border-line-strong hover:bg-card hover:text-fg"
              >
                <Icon size={17} className="text-fg-3 transition-colors group-hover:text-accent" aria-hidden="true" />
                <span>{siteNavigationText(item.label, locale)}</span>
                <ArrowRight size={15} className="ml-auto text-fg-3" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12 border-t border-line/70 pt-12 sm:mt-16 sm:pt-16" aria-labelledby="sitemap-extended-title">
        <div>
          <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">02 · COMPLETE DIRECTORY</p>
          <h2 id="sitemap-extended-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
            {copy.extended}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">{copy.extendedDescription}</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {EXTENDED_DESTINATION_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.id}
                className="rounded-3xl border border-line/70 bg-panel/35 p-4 sm:p-5"
                aria-labelledby={`sitemap-extended-${group.id}`}
              >
                <div className="flex items-start gap-3 px-1 pb-4 sm:px-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3">
                    <GroupIcon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 id={`sitemap-extended-${group.id}`} className="font-display text-base font-bold text-fg">
                      {siteNavigationText(group.label, locale)}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-fg-3">
                      {siteNavigationText(group.description, locale)}
                    </p>
                  </div>
                </div>
                <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <span aria-hidden="true" className="h-px w-2.5 shrink-0 rounded-full bg-line-strong transition-all group-hover:w-4 group-hover:bg-accent" />
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-semibold text-fg-2 transition-colors group-hover:text-accent">
                            {siteNavigationText(item.label, locale)}
                          </strong>
                          <span className="mt-0.5 line-clamp-1 block text-[0.69rem] leading-5 text-fg-3">
                            {siteNavigationText(item.description, locale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-line/70 bg-card/55 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label={t("footer.link.support")}>
        <div className="flex items-start gap-3">
          <CircleHelp size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="max-w-2xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "원하는 메뉴를 찾기 어렵거나 기능 제안이 있다면 이용 문의와 제보·제안에서 바로 알려주세요."
              : "When a destination is hard to find or you have an idea, reach us through Support or Feedback."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/support" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-panel px-4 py-2 text-sm font-bold text-fg-2 hover:text-accent">
            {locale === "ko" ? "이용 문의" : "Support"}
          </Link>
          <Link href="/feedback" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2 text-sm font-bold text-canvas">
            {locale === "ko" ? "제보·제안" : "Feedback"}<ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
