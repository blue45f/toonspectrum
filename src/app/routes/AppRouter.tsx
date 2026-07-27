import { Suspense, useEffect, useState, type AnimationEvent, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { LoadingState } from "@/components/LoadingState";
import { useT } from "@/lib/i18n";
import { lazyRetry } from "@/lib/lazy-retry";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { loadStudioI18nDictionaries } from "@/src/domains/creator/studio-i18n-loader";

function isStudioRoutePathname(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

function readInitialDocumentPathname(): string | null {
  try {
    return typeof globalThis.location?.pathname === "string"
      ? globalThis.location.pathname
      : null;
  } catch {
    return null;
  }
}

// AppRouter's module lifetime matches one browser document. Keep the delivery
// path stable across SPA transitions: a Studio document can retain COOP even
// when COEP is unavailable and `crossOriginIsolated` therefore stays false.
const INITIAL_DOCUMENT_PATHNAME = readInitialDocumentPathname();

// 정적 라우트의 브라우저 탭 제목. 동적 라우트(작가·펜카페)는 URL에서 유도하고,
// /title/* 은 작품명이 필요하므로 TitleDetailPage가 useDocumentTitle로 직접 설정한다.
const STATIC_TITLES: Record<string, string> = {
  "/": "",
  "/ranking": "route.ranking",
  "/search": "route.search",
  "/recommend": "route.recommend",
  "/explore": "route.explore",
  "/random": "route.random",
  "/feedback": "route.feedback",
  "/tags": "route.tags",
  "/calendar": "route.calendar",
  "/reviews": "route.reviews",
  "/community": "route.community",
  "/community/cafes": "route.community_cafes",
  "/admin/community": "route.adminCommunity",
  "/admin/members": "route.adminMembers",
  "/library": "route.library",
  "/compare": "route.compare",
  "/insights": "route.insights",
  "/authors": "route.authors",
  "/news": "route.news",
  "/about": "route.about",
  "/design": "route.design",
  "/sitemap": "route.sitemap",
  "/guide": "route.guide",
  "/settings": "route.settings",
  "/admin": "route.admin",
  "/terms": "route.terms",
  "/privacy": "route.privacy",
  "/copyright": "route.copyright",
  "/contact": "route.contact",
  "/support": "route.support",
  "/create": "route.create",
  "/studio": "route.studio",
  "/me": "route.me",
  "/fortune": "route.fortune",
  "/play": "route.play",
};

function useRouteTitle(pathname: string) {
  const t = useT();
  useEffect(() => {
    if (pathname.startsWith("/title/")) return; // 작품 상세는 페이지가 직접 설정
    if (pathname.startsWith("/create/")) return; // 창작물 상세는 페이지가 직접 설정
    if (pathname.startsWith("/u/")) return; // 회원 프로필은 페이지가 직접 설정
    if (pathname.startsWith("/community/cafes/")) return; // 카페 상세는 페이지가 직접 설정
    if (pathname.startsWith("/community/post/")) return; // 토론 스레드는 페이지가 직접 설정
    let title: string | undefined;
    if (pathname in STATIC_TITLES) {
      const titleKey = STATIC_TITLES[pathname];
      title = titleKey ? t(titleKey) : "";
    }
    else if (pathname.startsWith("/author/")) title = decodeURIComponent(pathname.slice(8));
    else if (pathname.startsWith("/pencafe/"))
      title = `${decodeURIComponent(pathname.slice(9))} ${t("route.pencafeSuffix")}`;
    else if (pathname.startsWith("/community/")) title = t("route.community");
    else if (pathname.startsWith("/admin/")) title = t("route.admin");
    else if (pathname.startsWith("/me")) title = t("route.me");
    document.title = title ? `${title} · ${t("app.name")}` : t("app.name");
  }, [pathname, t]);
}

// 라우트별 코드 분할 — 404만 eager, 나머지는 lazy로 초기 번들에서 분리.
// 페이지가 named export 라 default 로 매핑하고, lazyRetry가 청크 로드 실패를 복구한다.
const HomePage = lazyRetry(() => import("@/src/domains/catalog/HomePage").then((m) => ({ default: m.HomePage })), "HomePage");
const RankingPage = lazyRetry(() => import("@/src/domains/catalog/RankingPage").then((m) => ({ default: m.RankingPage })), "RankingPage");
const SearchPage = lazyRetry(() => import("@/src/domains/catalog/SearchPage").then((m) => ({ default: m.SearchPage })), "SearchPage");
const RecommendPage = lazyRetry(() => import("@/src/domains/catalog/RecommendPage").then((m) => ({ default: m.RecommendPage })), "RecommendPage");
const ExplorePage = lazyRetry(() => import("@/src/domains/catalog/ExplorePage").then((m) => ({ default: m.ExplorePage })), "ExplorePage");
const CalendarPage = lazyRetry(() => import("@/src/domains/catalog/CalendarPage").then((m) => ({ default: m.CalendarPage })), "CalendarPage");
const ReviewsPage = lazyRetry(() => import("@/src/domains/community/ReviewsPage").then((m) => ({ default: m.ReviewsPage })), "ReviewsPage");
const CommunityPage = lazyRetry(() => import("@/src/domains/community/CommunityPage").then((m) => ({ default: m.CommunityPage })), "CommunityPage");
const CommunityScopePage = lazyRetry(
  () => import("@/src/domains/community/CommunityPage").then((m) => ({ default: m.CommunityScopePage })),
  "CommunityScopePage"
);
const CafesPage = lazyRetry(() => import("@/src/domains/community/CafesPage").then((m) => ({ default: m.CafesPage })), "CafesPage");
const CafeDetailPage = lazyRetry(
  () => import("@/src/domains/community/CafeDetailPage").then((m) => ({ default: m.CafeDetailPage })),
  "CafeDetailPage"
);
const CommunityPostPage = lazyRetry(
  () => import("@/src/domains/community/CommunityPostPage").then((m) => ({ default: m.CommunityPostPage })),
  "CommunityPostPage"
);
const AdminCommunityPage = lazyRetry(
  () => import("@/src/domains/admin/AdminCommunityPage").then((m) => ({ default: m.AdminCommunityPage })),
  "AdminCommunityPage"
);
const AdminMembersPage = lazyRetry(
  () => import("@/src/domains/admin/AdminMembersPage").then((m) => ({ default: m.AdminMembersPage })),
  "AdminMembersPage"
);
const LibraryPage = lazyRetry(() => import("@/src/domains/catalog/LibraryPage").then((m) => ({ default: m.LibraryPage })), "LibraryPage");
const ComparePage = lazyRetry(() => import("@/src/domains/catalog/ComparePage").then((m) => ({ default: m.ComparePage })), "ComparePage");
const RandomPage = lazyRetry(() => import("@/src/domains/catalog/RandomPage").then((m) => ({ default: m.RandomPage })), "RandomPage");
const InsightsPage = lazyRetry(() => import("@/src/domains/catalog/InsightsPage").then((m) => ({ default: m.InsightsPage })), "InsightsPage");
const TitleDetailPage = lazyRetry(
  () => import("@/src/domains/catalog/TitleDetailPage").then((m) => ({ default: m.TitleDetailPage })),
  "TitleDetailPage"
);
const AuthorPage = lazyRetry(() => import("@/src/domains/catalog/AuthorPage").then((m) => ({ default: m.AuthorPage })), "AuthorPage");
const UserProfilePage = lazyRetry(
  () => import("@/src/domains/account/UserProfilePage").then((m) => ({ default: m.UserProfilePage })),
  "UserProfilePage"
);
const PencafePage = lazyRetry(() => import("@/src/domains/community/PencafePage").then((m) => ({ default: m.PencafePage })), "PencafePage");
const AdminPage = lazyRetry(() => import("@/src/domains/admin/AdminPage").then((m) => ({ default: m.AdminPage })), "AdminPage");
const FeedbackPage = lazyRetry(() => import("@/src/domains/legal/FeedbackPage").then((m) => ({ default: m.FeedbackPage })), "FeedbackPage");
const TagsPage = lazyRetry(() => import("@/src/domains/catalog/TagsPage").then((m) => ({ default: m.TagsPage })), "TagsPage");
const AuthorsPage = lazyRetry(() => import("@/src/domains/catalog/AuthorsPage").then((m) => ({ default: m.AuthorsPage })), "AuthorsPage");
const NewsPage = lazyRetry(() => import("@/src/domains/catalog/NewsPage").then((m) => ({ default: m.NewsPage })), "NewsPage");
const SettingsPage = lazyRetry(() => import("@/src/domains/account/SettingsPage").then((m) => ({ default: m.SettingsPage })), "SettingsPage");
const AboutPage = lazyRetry(() => import("@/src/domains/legal/AboutPage").then((m) => ({ default: m.AboutPage })), "AboutPage");
const GuidePage = lazyRetry(() => import("@/src/domains/catalog/GuidePage").then((m) => ({ default: m.GuidePage })), "GuidePage");
const DesignSystemPage = lazyRetry(
  () => import("@/src/domains/legal/DesignSystemPage").then((m) => ({ default: m.DesignSystemPage })),
  "DesignSystemPage"
);
const SitemapPage = lazyRetry(
  () => import("@/src/domains/legal/SitemapPage").then((m) => ({ default: m.SitemapPage })),
  "SitemapPage"
);
const CopyrightPage = lazyRetry(
  () => import("@/src/domains/legal/CopyrightPage").then((m) => ({ default: m.CopyrightPage })),
  "CopyrightPage"
);
const TermsPage = lazyRetry(() => import("@/src/domains/legal/PolicyPage").then((m) => ({ default: m.TermsPage })), "TermsPage");
const PrivacyPage = lazyRetry(() => import("@/src/domains/legal/PolicyPage").then((m) => ({ default: m.PrivacyPage })), "PrivacyPage");
const ContactPage = lazyRetry(() => import("@/src/domains/legal/ContactPage").then((m) => ({ default: m.ContactPage })), "ContactPage");
const SupportPage = lazyRetry(() => import("@/src/domains/legal/SupportPage").then((m) => ({ default: m.SupportPage })), "SupportPage");
const CreateGalleryPage = lazyRetry(
  () => import("@/src/domains/creator/CreateGalleryPage").then((m) => ({ default: m.CreateGalleryPage })),
  "CreateGalleryPage"
);
const CreateWorkPage = lazyRetry(
  () => import("@/src/domains/creator/CreateWorkPage").then((m) => ({ default: m.CreateWorkPage })),
  "CreateWorkPage"
);
const CreateSeriesPage = lazyRetry(
  () => import("@/src/domains/creator/CreateSeriesPage").then((m) => ({ default: m.CreateSeriesPage })),
  "CreateSeriesPage"
);
const CreateChallengesPage = lazyRetry(
  () => import("@/src/domains/creator/CreateChallengesPage").then((m) => ({ default: m.CreateChallengesPage })),
  "CreateChallengesPage"
);
const StudioPage = lazyRetry(
  async () => {
    const [module] = await Promise.all([
      import("@/src/domains/creator/StudioPage"),
      loadStudioI18nDictionaries(),
    ]);
    return { default: module.StudioPage };
  },
  "StudioPage",
);
const StudioCrossOriginIsolationGate = lazyRetry(
  () => import("@/src/app/StudioCrossOriginIsolationGate").then((m) => ({
    default: m.StudioCrossOriginIsolationGate,
  })),
  "StudioCrossOriginIsolationGate",
);
const StudioToolsCompanionPage = lazyRetry(
  async () => {
    const [module] = await Promise.all([
      import("@/src/domains/creator/StudioToolsCompanionPage"),
      loadStudioI18nDictionaries(),
    ]);
    return { default: module.StudioToolsCompanionPage };
  },
  "StudioToolsCompanionPage"
);
const AccountPage = lazyRetry(() => import("@/src/domains/account/AccountPage").then((m) => ({ default: m.AccountPage })), "AccountPage");
const AuthCallbackPage = lazyRetry(
  () => import("@/src/domains/account/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })),
  "AuthCallbackPage"
);
const FortunePage = lazyRetry(
  () => import("@/src/domains/fortune/FortunePage").then((m) => ({ default: m.FortunePage })),
  "FortunePage"
);
const PlayPage = lazyRetry(
  () => import("@/src/domains/play/PlayPage").then((m) => ({ default: m.PlayPage })),
  "PlayPage"
);
const NotFoundPage = lazyRetry(
  () => import("@/src/components/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
  "NotFoundPage"
);

// 라우트 로딩 폴백 — 공용 LoadingState의 카드 스켈레톤.
// 페이지의 대략적 골격(헤더 + 카드 그리드)을 미리 그려 레이아웃 점프와 빈 화면 깜빡임을 줄인다.
// 스피너 금지(DESIGN.md), prefers-reduced-motion 전역 가드를 그대로 따른다.
function RouteFallback() {
  const t = useT();
  return (
    <LoadingState
      variant="cards"
      label={t("common.loading")}
      className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6"
    />
  );
}

// route-stage-in 애니메이션(560ms)이 끝나면 transform/filter를 완전히 끊는다 — animation-fill-mode:
// both가 keyframe의 종료값을 계속 유지하는데, 그 값이 identity transform/filter라도 리터럴 none이
// 아닌 한(Chrome은 이걸 matrix(1,0,0,1,0,0) 등으로 정규화해 반환) 이 요소가 새 containing block이
// 되어 자손의 position: fixed를 뷰포트가 아닌 이 요소(라우트 전체 콘텐츠) 기준으로 배치해버린다.
function RouteStage({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [settled, setSettled] = useState(false);
  const instantEditorEntry = pathname === "/studio";
  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === "route-stage-in") setSettled(true);
  };
  return (
    <div
      key={pathname}
      className={cn(
        "route-stage",
        (settled || instantEditorEntry) && "route-stage--settled",
        instantEditorEntry && "route-stage--instant"
      )}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
}

export function AppRouter() {
  const { pathname } = useLocation();
  useRouteTitle(pathname);
  const documentWasStudio = isStudioRoutePathname(
    INITIAL_DOCUMENT_PATHNAME ?? pathname,
  );
  const routeTree = (
    <RouteStage pathname={pathname}>
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/recommend" element={<RecommendPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/cafes" element={<CafesPage />} />
          <Route path="/community/cafes/:slug" element={<CafeDetailPage />} />
          <Route path="/community/post/:id" element={<CommunityPostPage />} />
          <Route path="/community/:scope" element={<CommunityScopePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/random" element={<RandomPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/authors" element={<AuthorsPage />} />
          <Route path="/u/:userId" element={<UserProfilePage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/design" element={<DesignSystemPage />} />
          <Route path="/sitemap" element={<SitemapPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/copyright" element={<CopyrightPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/create" element={<CreateGalleryPage />} />
          <Route path="/create/challenges" element={<CreateChallengesPage />} />
          <Route path="/create/series/:id" element={<CreateSeriesPage />} />
          <Route path="/create/:id" element={<CreateWorkPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/studio/tools-companion" element={<StudioToolsCompanionPage />} />
          <Route path="/me" element={<AccountPage />} />
          <Route path="/title/:slug" element={<TitleDetailPage />} />
          <Route path="/author/:name" element={<AuthorPage />} />
          <Route path="/pencafe/:name" element={<PencafePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/community" element={<AdminCommunityPage />} />
          <Route path="/admin/members" element={<AdminMembersPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/fortune" element={<FortunePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </RouteStage>
  );
  const needsIsolationGate =
    isStudioRoutePathname(pathname)
    || documentWasStudio
    || globalThis.crossOriginIsolated === true;
  if (!needsIsolationGate) return routeTree;
  return (
    <Suspense fallback={<RouteFallback />}>
      <StudioCrossOriginIsolationGate
        pathname={pathname}
        documentWasStudio={documentWasStudio}
        pending={<RouteFallback />}
      >
        {routeTree}
      </StudioCrossOriginIsolationGate>
    </Suspense>
  );
}
