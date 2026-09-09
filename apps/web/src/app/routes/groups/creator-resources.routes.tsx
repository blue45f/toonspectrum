import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const CreatorHubPage = lazyRetry(() => import("@/domains/creator-resources/CreatorHubPage").then((module) => ({ default: module.CreatorHubPage })), "CreatorHubPage");
const NowPage = lazyRetry(() => import("@/domains/creator-resources/NowPage").then((module) => ({ default: module.NowPage })), "NowPage");
const OpportunitiesPage = lazyRetry(() => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpportunitiesPage })), "OpportunitiesPage");
const ReferenceAssetsPage = lazyRetry(() => import("@/domains/creator-resources/ReferenceAssetsPage").then((module) => ({ default: module.ReferenceAssetsPage })), "ReferenceAssetsPage");
const WorksPage = lazyRetry(() => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WorksPage })), "WorksPage");
const GlobalBooksPage = lazyRetry(() => import("@/domains/creator-resources/GlobalBooksPage").then((module) => ({ default: module.GlobalBooksPage })), "GlobalBooksPage");
const RecipesPage = lazyRetry(() => import("@/domains/creator-resources/RecipesPage").then((module) => ({ default: module.RecipesPage })), "RecipesPage");
const StoryLabPage = lazyRetry(() => import("@/domains/creator-resources/StoryLabPage").then((module) => ({ default: module.StoryLabPage })), "StoryLabPage");
const PublishingPage = lazyRetry(() => import("@/domains/creator-resources/PublishingPage").then((module) => ({ default: module.PublishingPage })), "PublishingPage");
const SourcesPage = lazyRetry(() => import("@/domains/creator-resources/SourcesPage").then((module) => ({ default: module.SourcesPage })), "SourcesPage");

export const creatorResourcesRoutes = defineAppRoutes([
  { id: "resources-now", path: "/now", element: <NowPage /> },
  { id: "research-home", path: "/research", element: <CreatorHubPage /> },
  { id: "research-assets", path: "/research/assets", element: <ReferenceAssetsPage /> },
  { id: "research-books", path: "/research/books", element: <GlobalBooksPage /> },
  { id: "resources-hub", path: "/creator-hub", element: <CreatorHubPage /> },
  { id: "resources-opportunities", path: "/opportunities", element: <OpportunitiesPage /> },
  { id: "resources-references", path: "/creator-hub/references", element: <ReferenceAssetsPage /> },
  { id: "resources-recipes", path: "/learn/recipes", element: <RecipesPage /> },
  { id: "resources-story", path: "/story-lab", element: <StoryLabPage /> },
  { id: "resources-works", path: "/discover/works", element: <WorksPage /> },
  { id: "resources-publishing", path: "/publishing", element: <PublishingPage /> },
  { id: "resources-sources", path: "/insights/resources", element: <SourcesPage /> },
  { id: "resources-showcase", path: "/showcase", element: <Navigate to="/create" replace /> },
  { id: "resources-challenges", path: "/challenges", element: <Navigate to="/create/challenges" replace /> },
]);
