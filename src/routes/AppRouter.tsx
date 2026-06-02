import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { HomePage } from "@/src/pages/HomePage";
import { NotFoundPage } from "@/src/pages/NotFoundPage";

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
  return (
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
        <Route path="/title/:slug" element={<TitleDetailPage />} />
        <Route path="/author/:name" element={<AuthorPage />} />
        <Route path="/pencafe/:name" element={<PencafePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
