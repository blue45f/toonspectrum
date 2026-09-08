import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const HomePage = lazyRetry(
  () => import("@/domains/creator-resources/CreatorHomePage").then((module) => ({ default: module.CreatorHomePage })),
  "HomePage",
);
const RankingPage = lazyRetry(
  () => import("@/domains/catalog/RankingPage").then((module) => ({ default: module.RankingPage })),
  "RankingPage",
);
const SearchPage = lazyRetry(
  () => import("@/domains/catalog/SearchPage").then((module) => ({ default: module.SearchPage })),
  "SearchPage",
);
const RecommendPage = lazyRetry(
  () => import("@/domains/catalog/RecommendPage").then((module) => ({ default: module.RecommendPage })),
  "RecommendPage",
);
const ExplorePage = lazyRetry(
  () => import("@/domains/catalog/ExplorePage").then((module) => ({ default: module.ExplorePage })),
  "ExplorePage",
);
const CalendarPage = lazyRetry(
  () => import("@/domains/catalog/CalendarPage").then((module) => ({ default: module.CalendarPage })),
  "CalendarPage",
);
const LibraryPage = lazyRetry(
  () => import("@/domains/catalog/LibraryPage").then((module) => ({ default: module.LibraryPage })),
  "LibraryPage",
);
const ComparePage = lazyRetry(
  () => import("@/domains/catalog/ComparePage").then((module) => ({ default: module.ComparePage })),
  "ComparePage",
);
const RandomPage = lazyRetry(
  () => import("@/domains/catalog/RandomPage").then((module) => ({ default: module.RandomPage })),
  "RandomPage",
);
const InsightsPage = lazyRetry(
  () => import("@/domains/catalog/InsightsPage").then((module) => ({ default: module.InsightsPage })),
  "InsightsPage",
);
const TitleDetailPage = lazyRetry(
  () => import("@/domains/catalog/TitleDetailPage").then((module) => ({ default: module.TitleDetailPage })),
  "TitleDetailPage",
);
const AuthorPage = lazyRetry(
  () => import("@/domains/catalog/AuthorPage").then((module) => ({ default: module.AuthorPage })),
  "AuthorPage",
);
const TagsPage = lazyRetry(
  () => import("@/domains/catalog/TagsPage").then((module) => ({ default: module.TagsPage })),
  "TagsPage",
);
const AuthorsPage = lazyRetry(
  () => import("@/domains/catalog/AuthorsPage").then((module) => ({ default: module.AuthorsPage })),
  "AuthorsPage",
);
const NewsPage = lazyRetry(
  () => import("@/domains/catalog/NewsPage").then((module) => ({ default: module.NewsPage })),
  "NewsPage",
);
const GuidePage = lazyRetry(
  () => import("@/domains/catalog/GuidePage").then((module) => ({ default: module.GuidePage })),
  "GuidePage",
);

export const catalogRoutes = defineAppRoutes([
  { id: "catalog-home", path: "/", element: <HomePage /> },
  { id: "catalog-ranking", path: "/ranking", element: <RankingPage /> },
  { id: "catalog-search", path: "/search", element: <SearchPage /> },
  { id: "catalog-recommend", path: "/recommend", element: <RecommendPage /> },
  { id: "catalog-explore", path: "/explore", element: <ExplorePage /> },
  { id: "catalog-calendar", path: "/calendar", element: <CalendarPage /> },
  { id: "catalog-library", path: "/library", element: <LibraryPage /> },
  { id: "catalog-compare", path: "/compare", element: <ComparePage /> },
  { id: "catalog-random", path: "/random", element: <RandomPage /> },
  { id: "catalog-insights", path: "/insights", element: <InsightsPage /> },
  { id: "catalog-tags", path: "/tags", element: <TagsPage /> },
  { id: "catalog-authors", path: "/authors", element: <AuthorsPage /> },
  { id: "catalog-news", path: "/news", element: <NewsPage /> },
  { id: "catalog-guide", path: "/guide", element: <GuidePage /> },
  { id: "catalog-title", path: "/title/:slug", element: <TitleDetailPage /> },
  { id: "catalog-author", path: "/author/:name", element: <AuthorPage /> },
]);
