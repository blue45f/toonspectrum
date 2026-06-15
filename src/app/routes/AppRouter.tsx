import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { NotFoundPage } from "@/src/components/NotFoundPage";
import { HomePage } from "@/src/domains/catalog/HomePage";

// 정적 라우트의 브라우저 탭 제목. 동적 라우트(작가·펜카페)는 URL에서 유도하고,
// /title/* 은 작품명이 필요하므로 TitleDetailPage가 useDocumentTitle로 직접 설정한다.
const STATIC_TITLES: Record<string, string> = {
  "/": "",
  "/ranking": "통합 랭킹",
  "/search": "검색",
  "/recommend": "맞춤 추천",
  "/explore": "스펙트럼 탐색",
  "/random": "랜덤 발견",
  "/feedback": "의견 게시판",
  "/tags": "태그로 찾기",
  "/calendar": "연재 캘린더",
  "/reviews": "리뷰",
  "/community": "커뮤니티",
  "/community/cafes": "장르 카페",
  "/admin/community": "커뮤니티 관리",
  "/admin/members": "회원 관리",
  "/library": "내 서재",
  "/compare": "작품 비교",
  "/insights": "트렌드 인사이트",
  "/authors": "작가별 보기",
  "/news": "웹툰·웹소설 소식",
  "/about": "소개",
  "/design": "디자인 시스템",
  "/guide": "랭킹 산정 방식",
  "/settings": "설정",
  "/admin": "관리자 콘솔",
  "/terms": "이용약관",
  "/privacy": "개인정보처리방침",
  "/copyright": "저작권·콘텐츠 안내",
  "/contact": "광고·제휴 문의",
  "/create": "창작 게시판",
  "/studio": "창작 스튜디오",
  "/me": "내 정보",
};

function useRouteTitle(pathname: string) {
  useEffect(() => {
    if (pathname.startsWith("/title/")) return; // 작품 상세는 페이지가 직접 설정
    if (pathname.startsWith("/create/")) return; // 창작물 상세는 페이지가 직접 설정
    if (pathname.startsWith("/u/")) return; // 회원 프로필은 페이지가 직접 설정
    if (pathname.startsWith("/community/cafes/")) return; // 카페 상세는 페이지가 직접 설정
    if (pathname.startsWith("/community/post/")) return; // 토론 스레드는 페이지가 직접 설정
    let title: string | undefined;
    if (pathname in STATIC_TITLES) title = STATIC_TITLES[pathname];
    else if (pathname.startsWith("/author/")) title = decodeURIComponent(pathname.slice(8));
    else if (pathname.startsWith("/pencafe/")) title = `${decodeURIComponent(pathname.slice(9))} 펜카페`;
    else if (pathname.startsWith("/community/")) title = "커뮤니티";
    document.title = title ? `${title} · 툰스펙트럼` : "툰스펙트럼";
  }, [pathname]);
}

// ── 청크 로드 재시도 ──
// 배포로 청크 해시가 바뀌면 이전 세션의 lazy import가 404로 실패한다. 그 경우 1회만
// 자동 새로고침해 새 해시를 받아오고, 새로고침 후에도 같은 청크가 또 실패하면(2차)
// 그대로 throw해 ErrorBoundary가 받게 한다. 가드는 sessionStorage 청크별 키로 추적한다.

function hasReloadGuard(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return true; // 저장소 차단 환경 — 추적이 불가하면 이미 리로드한 것으로 간주해 루프를 차단
  }
}

function armReloadGuard(key: string): boolean {
  try {
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false; // 가드를 세우지 못하면 리로드하지 않는다(무한 리로드 방지)
  }
}

function clearReloadGuard(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // 저장소 차단 환경 — 세워둔 가드도 없으므로 무시
  }
}

function lazyRetry<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>, chunkId: string) {
  return lazy(async () => {
    const guardKey = `chunk-reload:${chunkId}`;
    try {
      const mod = await load();
      clearReloadGuard(guardKey); // 성공 시 해제 — 다음 배포 실패 때 다시 1회 재시도할 수 있다
      return mod;
    } catch (error) {
      // 이미 1회 리로드했거나 가드를 세울 수 없으면 그대로 던져 ErrorBoundary로 보낸다.
      if (hasReloadGuard(guardKey) || !armReloadGuard(guardKey)) throw error;
      window.location.reload(); // 가드를 유지한 채 새로고침 — 같은 청크의 자동 리로드를 1회로 제한
      return await new Promise<never>(() => {}); // 리로드가 끝날 때까지 Suspense fallback 유지
    }
  });
}

// 라우트별 코드 분할 — 랜딩(HomePage)·404는 eager, 나머지는 lazy로 초기 번들에서 분리.
// 페이지가 named export 라 default 로 매핑하고, lazyRetry가 청크 로드 실패를 복구한다.
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
const CopyrightPage = lazyRetry(
  () => import("@/src/domains/legal/CopyrightPage").then((m) => ({ default: m.CopyrightPage })),
  "CopyrightPage"
);
const TermsPage = lazyRetry(() => import("@/src/domains/legal/PolicyPage").then((m) => ({ default: m.TermsPage })), "TermsPage");
const PrivacyPage = lazyRetry(() => import("@/src/domains/legal/PolicyPage").then((m) => ({ default: m.PrivacyPage })), "PrivacyPage");
const ContactPage = lazyRetry(() => import("@/src/domains/legal/ContactPage").then((m) => ({ default: m.ContactPage })), "ContactPage");
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
const StudioPage = lazyRetry(() => import("@/src/domains/creator/StudioPage").then((m) => ({ default: m.StudioPage })), "StudioPage");
const AccountPage = lazyRetry(() => import("@/src/domains/account/AccountPage").then((m) => ({ default: m.AccountPage })), "AccountPage");
const AuthCallbackPage = lazyRetry(
  () => import("@/src/domains/account/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })),
  "AuthCallbackPage"
);

// 라우트 로딩 폴백 — 스피너 대신 스켈레톤(DESIGN.md: "스켈레톤 로딩, 스피너 금지").
// 페이지의 대략적 골격(헤더 + 카드 그리드)을 미리 그려 레이아웃 점프와 빈 화면 깜빡임을 줄인다.
// skeleton 유틸은 토큰화된 shimmer라 prefers-reduced-motion 전역 가드를 그대로 따른다.
function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6" role="status" aria-label="불러오는 중">
      <div className="flex flex-col gap-3">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-9 w-2/3 max-w-md" />
        <span className="skeleton h-4 w-1/2 max-w-sm" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="skeleton aspect-[3/4] w-full rounded-2xl" />
        ))}
      </div>
      <span className="sr-only">불러오는 중</span>
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
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/copyright" element={<CopyrightPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/create" element={<CreateGalleryPage />} />
          <Route path="/create/challenges" element={<CreateChallengesPage />} />
          <Route path="/create/series/:id" element={<CreateSeriesPage />} />
          <Route path="/create/:id" element={<CreateWorkPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/me" element={<AccountPage />} />
          <Route path="/title/:slug" element={<TitleDetailPage />} />
          <Route path="/author/:name" element={<AuthorPage />} />
          <Route path="/pencafe/:name" element={<PencafePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/community" element={<AdminCommunityPage />} />
          <Route path="/admin/members" element={<AdminMembersPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
