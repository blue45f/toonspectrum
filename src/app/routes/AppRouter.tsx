import { Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { RouteFallback } from "./route-fallback";
import { RouteStage } from "./route-stage";
import { useRouteTitle } from "./route-titles";

import { lazyRetry } from "@/lib/lazy-retry";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { loadStudioI18nDictionaries } from "@/src/domains/creator/studio-i18n-loader";
import { isStudioRoutePathname } from "@/src/domains/creator/studio-workspace-route";


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

/* -------------------------------------------------------------------------- */
/* Catalog Domain Routes                                                      */
/* -------------------------------------------------------------------------- */
const HomePage = lazyRetry(() => import("@/src/domains/catalog/HomePage").then((m) => ({ default: m.HomePage })), "HomePage");
const RankingPage = lazyRetry(() => import("@/src/domains/catalog/RankingPage").then((m) => ({ default: m.RankingPage })), "RankingPage");
const SearchPage = lazyRetry(() => import("@/src/domains/catalog/SearchPage").then((m) => ({ default: m.SearchPage })), "SearchPage");
const RecommendPage = lazyRetry(() => import("@/src/domains/catalog/RecommendPage").then((m) => ({ default: m.RecommendPage })), "RecommendPage");
const ExplorePage = lazyRetry(() => import("@/src/domains/catalog/ExplorePage").then((m) => ({ default: m.ExplorePage })), "ExplorePage");
const CalendarPage = lazyRetry(() => import("@/src/domains/catalog/CalendarPage").then((m) => ({ default: m.CalendarPage })), "CalendarPage");
const LibraryPage = lazyRetry(() => import("@/src/domains/catalog/LibraryPage").then((m) => ({ default: m.LibraryPage })), "LibraryPage");
const ComparePage = lazyRetry(() => import("@/src/domains/catalog/ComparePage").then((m) => ({ default: m.ComparePage })), "ComparePage");
const RandomPage = lazyRetry(() => import("@/src/domains/catalog/RandomPage").then((m) => ({ default: m.RandomPage })), "RandomPage");
const InsightsPage = lazyRetry(() => import("@/src/domains/catalog/InsightsPage").then((m) => ({ default: m.InsightsPage })), "InsightsPage");
const TitleDetailPage = lazyRetry(
  () => import("@/src/domains/catalog/TitleDetailPage").then((m) => ({ default: m.TitleDetailPage })),
  "TitleDetailPage"
);
const AuthorPage = lazyRetry(() => import("@/src/domains/catalog/AuthorPage").then((m) => ({ default: m.AuthorPage })), "AuthorPage");
const TagsPage = lazyRetry(() => import("@/src/domains/catalog/TagsPage").then((m) => ({ default: m.TagsPage })), "TagsPage");
const AuthorsPage = lazyRetry(() => import("@/src/domains/catalog/AuthorsPage").then((m) => ({ default: m.AuthorsPage })), "AuthorsPage");
const NewsPage = lazyRetry(() => import("@/src/domains/catalog/NewsPage").then((m) => ({ default: m.NewsPage })), "NewsPage");
const GuidePage = lazyRetry(() => import("@/src/domains/catalog/GuidePage").then((m) => ({ default: m.GuidePage })), "GuidePage");

/* -------------------------------------------------------------------------- */
/* Community Domain Routes                                                    */
/* -------------------------------------------------------------------------- */
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
const PencafePage = lazyRetry(() => import("@/src/domains/community/PencafePage").then((m) => ({ default: m.PencafePage })), "PencafePage");

/* -------------------------------------------------------------------------- */
/* Creator Domain Routes                                                      */
/* -------------------------------------------------------------------------- */
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
const StudioRouter = lazyRetry(
  async () => {
    const [module] = await Promise.all([
      import("@/src/domains/creator/studio-router/StudioRouter"),
      loadStudioI18nDictionaries(),
    ]);
    return { default: module.StudioRouter };
  },
  "StudioRouter",
);

/* -------------------------------------------------------------------------- */
/* Market Domain Routes                                                       */
/* -------------------------------------------------------------------------- */
const MarketHomePage = lazyRetry(
  () => import("@/src/domains/market/pages/MarketHomePage").then((m) => ({ default: m.MarketHomePage })),
  "MarketHomePage"
);
const MarketBrowsePage = lazyRetry(
  () => import("@/src/domains/market/pages/MarketBrowsePage").then((m) => ({ default: m.MarketBrowsePage })),
  "MarketBrowsePage"
);
const MarketResourceDetailPage = lazyRetry(
  () => import("@/src/domains/market/pages/MarketResourceDetailPage").then((m) => ({
    default: m.MarketResourceDetailPage,
  })),
  "MarketResourceDetailPage"
);

/* -------------------------------------------------------------------------- */
/* Account & Admin Domain Routes                                              */
/* -------------------------------------------------------------------------- */
const AccountPage = lazyRetry(() => import("@/src/domains/account/AccountPage").then((m) => ({ default: m.AccountPage })), "AccountPage");
const UserProfilePage = lazyRetry(
  () => import("@/src/domains/account/UserProfilePage").then((m) => ({ default: m.UserProfilePage })),
  "UserProfilePage"
);
const SettingsPage = lazyRetry(() => import("@/src/domains/account/SettingsPage").then((m) => ({ default: m.SettingsPage })), "SettingsPage");
const AuthCallbackPage = lazyRetry(
  () => import("@/src/domains/account/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })),
  "AuthCallbackPage"
);
const AdminPage = lazyRetry(() => import("@/src/domains/admin/AdminPage").then((m) => ({ default: m.AdminPage })), "AdminPage");
const AdminCommunityPage = lazyRetry(
  () => import("@/src/domains/admin/AdminCommunityPage").then((m) => ({ default: m.AdminCommunityPage })),
  "AdminCommunityPage"
);
const AdminMembersPage = lazyRetry(
  () => import("@/src/domains/admin/AdminMembersPage").then((m) => ({ default: m.AdminMembersPage })),
  "AdminMembersPage"
);

/* -------------------------------------------------------------------------- */
/* Legal & Static Domain Routes                                               */
/* -------------------------------------------------------------------------- */
const AboutPage = lazyRetry(() => import("@/src/domains/legal/AboutPage").then((m) => ({ default: m.AboutPage })), "AboutPage");
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
const FeedbackPage = lazyRetry(() => import("@/src/domains/legal/FeedbackPage").then((m) => ({ default: m.FeedbackPage })), "FeedbackPage");

/* -------------------------------------------------------------------------- */
/* Play & Fortune Domain Routes                                               */
/* -------------------------------------------------------------------------- */
const FortunePage = lazyRetry(
  () => import("@/src/domains/fortune/FortunePage").then((m) => ({ default: m.FortunePage })),
  "FortunePage"
);
const PlayPage = lazyRetry(
  () => import("@/src/domains/play/PlayPage").then((m) => ({ default: m.PlayPage })),
  "PlayPage"
);

/* -------------------------------------------------------------------------- */
/* Core Shell & Error Handlers                                                */
/* -------------------------------------------------------------------------- */
const StudioCrossOriginIsolationGate = lazyRetry(
  () => import("@/src/app/StudioCrossOriginIsolationGate").then((m) => ({
    default: m.StudioCrossOriginIsolationGate,
  })),
  "StudioCrossOriginIsolationGate",
);
const NotFoundPage = lazyRetry(
  () => import("@/src/components/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
  "NotFoundPage"
);

export function AppRouter() {
  const { pathname, search } = useLocation();
  useRouteTitle(pathname, search);
  const documentWasStudio = isStudioRoutePathname(
    INITIAL_DOCUMENT_PATHNAME ?? pathname,
  );

  const routeTree = (
    <RouteStage pathname={pathname} search={search}>
      <ErrorBoundary resetKey={`${pathname}${search}`}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Catalog Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/recommend" element={<RecommendPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/random" element={<RandomPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/authors" element={<AuthorsPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/title/:slug" element={<TitleDetailPage />} />
            <Route path="/author/:name" element={<AuthorPage />} />

            {/* Community Routes */}
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/community/cafes" element={<CafesPage />} />
            <Route path="/community/cafes/:slug" element={<CafeDetailPage />} />
            <Route path="/community/post/:id" element={<CommunityPostPage />} />
            <Route path="/community/:scope" element={<CommunityScopePage />} />
            <Route path="/pencafe/:name" element={<PencafePage />} />

            {/* Creator Routes */}
            <Route path="/create" element={<CreateGalleryPage />} />
            <Route path="/create/challenges" element={<CreateChallengesPage />} />
            <Route path="/create/series/:id" element={<CreateSeriesPage />} />
            <Route path="/create/:id" element={<CreateWorkPage />} />
            <Route path="/studio/*" element={<StudioRouter />} />

            {/* Market Routes */}
            <Route path="/market" element={<MarketHomePage />} />
            <Route path="/market/browse" element={<MarketBrowsePage />} />
            <Route path="/market/resource/:id" element={<MarketResourceDetailPage />} />

            {/* Account & Admin Routes */}
            <Route path="/me" element={<AccountPage />} />
            <Route path="/u/:userId" element={<UserProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/community" element={<AdminCommunityPage />} />
            <Route path="/admin/members" element={<AdminMembersPage />} />

            {/* Legal & Static Routes */}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/design" element={<DesignSystemPage />} />
            <Route path="/sitemap" element={<SitemapPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/copyright" element={<CopyrightPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/feedback" element={<FeedbackPage />} />

            {/* Play & Fortune Routes */}
            <Route path="/fortune" element={<FortunePage />} />
            <Route path="/play" element={<PlayPage />} />

            {/* Catch-all 404 Route */}
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
