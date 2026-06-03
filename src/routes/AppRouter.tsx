import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { HomePage } from "@/src/pages/HomePage";
import { NotFoundPage } from "@/src/pages/NotFoundPage";
import { ErrorBoundary } from "@/src/components/error-boundary";

// 정적 라우트의 브라우저 탭 제목. 동적 라우트(작가·펜카페)는 URL에서 유도하고,
// /title/* 은 작품명이 필요하므로 TitleDetailPage가 useDocumentTitle로 직접 설정한다.
const STATIC_TITLES: Record<string, string> = {
  "/": "",
  "/ranking": "통합 랭킹",
  "/search": "검색",
  "/recommend": "맞춤 추천",
  "/explore": "스펙트럼 탐색",
  "/calendar": "연재 캘린더",
  "/reviews": "리뷰",
  "/community": "커뮤니티",
  "/library": "내 서재",
  "/compare": "작품 비교",
  "/insights": "트렌드 인사이트",
  "/authors": "작가별 보기",
  "/admin": "관리자 콘솔",
};

function useRouteTitle(pathname: string) {
  useEffect(() => {
    if (pathname.startsWith("/title/")) return; // 작품 상세는 페이지가 직접 설정
    let title: string | undefined;
    if (pathname in STATIC_TITLES) title = STATIC_TITLES[pathname];
    else if (pathname.startsWith("/author/")) title = decodeURIComponent(pathname.slice(8));
    else if (pathname.startsWith("/pencafe/")) title = `${decodeURIComponent(pathname.slice(9))} 펜카페`;
    else if (pathname.startsWith("/community/")) title = "커뮤니티";
    document.title = title ? `${title} · WEBDEX` : "WEBDEX";
  }, [pathname]);
}

// 라우트별 코드 분할 — 랜딩(HomePage)·404는 eager, 나머지는 lazy로 초기 번들에서 분리.
// 페이지가 named export 라 default 로 매핑한다.
const RankingPage = lazy(() => import("@/src/pages/RankingPage").then((m) => ({ default: m.RankingPage })));
const SearchPage = lazy(() => import("@/src/pages/SearchPage").then((m) => ({ default: m.SearchPage })));
const RecommendPage = lazy(() => import("@/src/pages/RecommendPage").then((m) => ({ default: m.RecommendPage })));
const ExplorePage = lazy(() => import("@/src/pages/ExplorePage").then((m) => ({ default: m.ExplorePage })));
const CalendarPage = lazy(() => import("@/src/pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const ReviewsPage = lazy(() => import("@/src/pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const CommunityPage = lazy(() => import("@/src/pages/CommunityPage").then((m) => ({ default: m.CommunityPage })));
const CommunityScopePage = lazy(() =>
  import("@/src/pages/CommunityPage").then((m) => ({ default: m.CommunityScopePage }))
);
const LibraryPage = lazy(() => import("@/src/pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const ComparePage = lazy(() => import("@/src/pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const InsightsPage = lazy(() => import("@/src/pages/InsightsPage").then((m) => ({ default: m.InsightsPage })));
const TitleDetailPage = lazy(() =>
  import("@/src/pages/TitleDetailPage").then((m) => ({ default: m.TitleDetailPage }))
);
const AuthorPage = lazy(() => import("@/src/pages/AuthorPage").then((m) => ({ default: m.AuthorPage })));
const PencafePage = lazy(() => import("@/src/pages/PencafePage").then((m) => ({ default: m.PencafePage })));
const AdminPage = lazy(() => import("@/src/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const FeedbackPage = lazy(() => import("@/src/pages/FeedbackPage").then((m) => ({ default: m.FeedbackPage })));
const TagsPage = lazy(() => import("@/src/pages/TagsPage").then((m) => ({ default: m.TagsPage })));
const AuthorsPage = lazy(() => import("@/src/pages/AuthorsPage").then((m) => ({ default: m.AuthorsPage })));
const AuthCallbackPage = lazy(() =>
  import("@/src/pages/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage }))
);

function RouteFallback() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="불러오는 중"
    >
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

export function AppRouter() {
  const { pathname } = useLocation();
  useRouteTitle(pathname);
  return (
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
          <Route path="/community/:scope" element={<CommunityScopePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/authors" element={<AuthorsPage />} />
          <Route path="/title/:slug" element={<TitleDetailPage />} />
          <Route path="/author/:name" element={<AuthorPage />} />
          <Route path="/pencafe/:name" element={<PencafePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
