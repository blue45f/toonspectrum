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

const PERSONAL_DESTINATIONS = [
  SITE_NAVIGATION_ITEMS.me,
  {
    id: "profile-account",
    href: "/me",
    icon: UserRound,
    label: { ko: "프로필·계정", en: "Profile & account" },
    description: {
      ko: "프로필과 계정 정보, 내 활동 관리",
      en: "Manage your profile, account details and activity",
    },
  },
  ...SITE_UTILITY_NAVIGATION,
] as const;

/**
 * Canonical user-facing destinations only. Dynamic detail pages, administrator and authentication
 * routes, redirect aliases, Studio companion windows and unfinished placeholders stay out of the
 * public directory.
 */
const EXTENDED_DESTINATION_GROUPS: readonly ExtendedDestinationGroup[] = [
  {
    id: "studio-workspaces",
    icon: Wrench,
    label: { ko: "Studio 작업공간", en: "Studio workspaces" },
    description: {
      ko: "드로잉·애니메이션·3D·게시까지 직접 여는 제작 화면",
      en: "Open drawing, animation, 3D and publishing workspaces directly",
    },
    items: [
      destination("/studio", "빈 캔버스 편집기", "Blank canvas editor", "새 초안을 바로 열어 자유롭게 제작", "Open a draft and start creating immediately"),
      destination("/studio/animation", "애니메이션 작업실", "Animation workspace", "프레임과 움직임을 편집", "Edit frames and motion"),
      destination("/studio/brushes", "Studio 브러시", "Studio brushes", "작업 중 브러시를 선택하고 조정", "Choose and tune brushes while editing"),
      destination("/studio/bg3d", "3D 배경", "3D backgrounds", "장면 배경과 카메라 구도 설계", "Build scene backgrounds and camera composition"),
      destination("/studio/poser", "포즈 스튜디오", "Pose studio", "인체 포즈와 구도 참고 만들기", "Create pose and composition references"),
      destination("/studio/character", "캐릭터 작업실", "Character workspace", "캐릭터 외형·표정·자세 제작", "Build character looks, expressions and poses"),
      destination("/studio/3d/dcc/model", "3D 모델링", "3D modeling", "메시를 만들고 편집하는 기본 작업 모드", "Create and edit meshes in the core modeling mode"),
      destination("/studio/3d/dcc/build", "3D 공간 제작", "3D environment build", "방·배경·공간 구조 제작", "Build rooms, backgrounds and spatial structures"),
      destination("/studio/3d/dcc/cad", "정밀 CAD", "Precision CAD", "치수 기반 솔리드와 소품 설계", "Design dimensioned solids and props"),
      destination("/studio/3d/dcc/sculpt", "3D 조형", "3D sculpting", "브러시로 형태와 디테일 조형", "Sculpt forms and detail with brushes"),
      destination("/studio/3d/dcc/material", "재질·UV", "Materials & UV", "표면 재질과 UV 구성", "Build surface materials and UV layouts"),
      destination("/studio/3d/dcc/shot", "컷·선화", "Shot & line art", "카메라 컷과 비사실 렌더 설계", "Design camera shots and non-photoreal rendering"),
      destination("/studio/lift3d", "2D → 3D 변환", "2D to 3D lift", "이미지 소재를 3D 장면으로 확장", "Lift image subjects into 3D scenes"),
      destination("/studio/storyworld", "스토리월드", "Storyworld", "인물·장소·설정의 관계 정리", "Organize characters, locations and story relationships"),
      destination("/studio/publish", "Studio 게시", "Studio publish", "완성한 초안의 게시 준비", "Prepare a finished draft for publishing"),
      destination("/studio/manual", "Studio 사용 설명서", "Studio manual", "도구·작업 흐름·문제 해결 안내", "Learn tools, workflows and troubleshooting"),
      destination("/brush-lab", "브러시 연구실", "Brush lab", "브러시를 만들고 시험하기", "Build and test custom brushes"),
      destination("/music", "음악·사운드", "Music & sound", "작품에 연결할 음원 만들기", "Create audio for your work"),
      destination("/create/promo", "프로모션 제작", "Promotion studio", "작품 홍보용 이미지와 소재 만들기", "Create promotional visuals and assets"),
    ],
  },
  {
    id: "learning-publishing",
    icon: BookOpen,
    label: { ko: "학습·기획·출판", en: "Learning, planning & publishing" },
    description: {
      ko: "제작을 배우고 이야기와 공개 준비를 구체화",
      en: "Learn production and prepare stories and releases",
    },
    items: [
      destination("/learn", "웹툰 제작 강좌", "Creation courses", "기초부터 Studio 실습까지", "Learn from foundations to studio practice"),
      destination("/learn/glossary", "웹툰 용어 사전", "Creation glossary", "제작 용어와 예시 빠르게 찾기", "Find production terms and examples"),
      destination("/learn/studio", "Studio 실습 과정", "Studio practice", "배운 내용을 작업공간에서 따라 하기", "Practice lessons inside the workspace"),
      destination("/learn/records", "학습 기록 관리", "Learning records", "진행 기록을 백업하고 복원", "Back up and restore learning progress"),
      destination("/learn/recipes", "제작 레시피", "Creative recipes", "연출을 직접 조작하며 학습", "Learn direction through hands-on recipes"),
      destination("/story-lab", "스토리 연구실", "Story lab", "인물·욕망·갈등 설계", "Shape characters, desire and conflict"),
      destination("/publishing", "연재·출판 준비", "Publishing prep", "원고·권리·소개 자료 점검", "Check manuscripts, rights and pitch materials"),
    ],
  },
  {
    id: "production-collaboration",
    icon: Sparkles,
    label: { ko: "제작 운영·협업", en: "Production & collaboration" },
    description: {
      ko: "검수·버전·발표·공유와 공동 작업 흐름",
      en: "Review, version, present, share and collaborate on work",
    },
    items: [
      destination("/studio/review", "리뷰·승인", "Review & approval", "작업을 검수하고 의견 반영", "Review work and resolve feedback"),
      destination("/studio/versions", "버전·복구", "Versions & recovery", "저장 이력과 복구 지점 관리", "Manage version history and recovery points"),
      destination("/studio/present", "발표 모드", "Presentation mode", "작업을 발표용 화면으로 확인", "Preview work in presentation mode"),
      destination("/studio/share", "공유 설정", "Sharing", "링크와 협업 권한 관리", "Manage links and collaboration access"),
      destination("/studio/join", "협업 참여", "Join collaboration", "초대받은 공동 작업에 참여", "Join an invited collaborative session"),
    ],
  },
  {
    id: "collections",
    icon: Database,
    label: { ko: "작품·에셋 관리", en: "Work & asset management" },
    description: {
      ko: "공개 작품과 제작 재료를 더 세밀하게 탐색하고 관리",
      en: "Explore and manage published work and creative materials in detail",
    },
    items: [
      destination("/create/challenges", "창작 챌린지", "Creative challenges", "주제별 창작 이벤트", "Join themed creative events"),
      destination("/authors", "작가별 보기", "Browse creators", "작가와 대표 작품 탐색", "Explore creators and representative work"),
      destination("/discover/works", "만화·작법서 탐색", "Comics & craft books", "만화와 창작 참고서를 함께 검색", "Search comics and creative craft books"),
      destination("/market/browse", "에셋 상세 탐색", "Browse assets", "종류·사용권으로 리소스 찾기", "Find resources by type and license"),
      destination("/market/fit", "에셋 핏 랩", "Asset fit lab", "현재 작업에 맞는 에셋 점검", "Evaluate assets against the current project"),
      destination("/market/publish", "에셋 등록", "Publish an asset", "마켓에 리소스 제출·배포", "Submit and publish resources to Market"),
      destination("/market/manage", "판매·배포 관리", "Manage listings", "등록한 에셋과 배포 상태 관리", "Manage published assets and distribution"),
      destination("/market/library", "내 에셋", "My assets", "획득한 리소스 관리", "Manage acquired resources"),
      destination("/market/wishlist", "찜한 에셋", "Saved assets", "나중에 사용할 리소스", "Keep resources for later"),
      destination("/market/compare", "에셋 비교", "Compare assets", "후보 리소스의 차이 비교", "Compare shortlisted resources"),
      destination("/references", "작품 레퍼런스", "Story references", "공식 자료 탐색과 연구 노트", "Explore official sources and notes"),
      destination("/research/assets", "레퍼런스 아틀라스", "Reference atlas", "복식·소품·미술 자료를 장면별로", "Browse costume, prop and art references by scene"),
      destination("/research/books", "글로벌 판본 탐색", "Global editions", "Open Library·openBD 메타데이터 검색", "Search Open Library and openBD metadata"),
    ],
  },
  {
    id: "data-discovery",
    icon: Search,
    label: { ko: "검색·데이터 도구", en: "Search & data tools" },
    description: {
      ko: "작품을 비교하고 취향·태그·공식 데이터로 더 깊게 탐색",
      en: "Compare stories and explore through taste, tags and official data",
    },
    items: [
      destination("/search", "통합 검색", "Unified search", "작품·작가·태그 검색", "Search stories, creators and tags"),
      destination("/explore", "취향 탐색", "Taste explorer", "장르·태그·조건으로 작품 둘러보기", "Browse stories by genre, tag and preference"),
      destination("/compare", "작품 비교", "Compare stories", "두 작품의 주요 지표 비교", "Compare key signals across two stories"),
      destination("/random", "랜덤 발견", "Random discovery", "조건에 맞는 작품 무작위 추천", "Discover a random matching story"),
      destination("/tags", "태그로 찾기", "Explore tags", "인기·유사 태그 탐색", "Explore popular and related tags"),
      destination("/news", "업계 소식", "Industry news", "웹툰·웹소설 관련 소식", "Follow webtoon and web novel news"),
      destination("/insights/resources", "공식 자료·API 안내", "Official data & APIs", "데이터 출처와 연동 방법 확인", "Review official sources and integration guidance"),
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
      ko: "서비스 원칙과 접근성, 데이터 출처, 문의 및 권리 정책",
      en: "Service principles, accessibility, data sources, support and rights policies",
    },
    items: [
      destination("/about", "서비스 소개", "About ToonStudio", "기능과 운영 원칙", "Features and operating principles"),
      destination("/about/data", "데이터 출처", "Data sources", "공급자별 연결·이용 준비 상태", "Provider connections and readiness"),
      destination("/about/crawler", "공개 데이터 수집 정책", "Public data policy", "자동수집 원칙·제외·중지 요청", "Collection rules, exclusions and opt-out"),
      destination("/guide", "랭킹 산정 방식", "Ranking guide", "데이터와 산식 설명", "Understand ranking data and formulas"),
      destination("/accessibility", "접근성 안내", "Accessibility", "키보드·스크린리더·표시 지원", "Keyboard, screen reader and display support"),
      destination("/design", "디자인 시스템", "Design system", "색상·타이포·컴포넌트 원칙", "Colors, typography and component guidelines"),
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
    extended: "전체 기능과 페이지",
    extendedDescription: "직접 열 수 있는 제작·학습·관리·데이터·정책 페이지를 한곳에 모았습니다.",
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
    extended: "All features and pages",
    extendedDescription: "Browse every directly accessible creation, learning, management, data and policy page.",
    home: "Back to home",
  },
} as const;

export function SitemapPage() {
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const copy = PAGE_COPY[locale];
  const t = useT();

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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PERSONAL_DESTINATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                title={siteNavigationText(item.description, locale)}
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
