import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const CatalogResearchPage = lazyRetry(
  () => import("@/domains/creator-resources/CatalogResearchPage").then((module) => ({ default: module.CatalogResearchPage })),
  "CatalogResearchPage",
);

const CreatorHubPage = lazyRetry(
  () => import("@/domains/creator-resources/CreatorHubPage").then((module) => ({ default: module.CreatorHubPage })),
  "CreatorHubPage",
);
const NowPage = lazyRetry(
  () => import("@/domains/creator-resources/NowPage").then((module) => ({ default: module.NowPage })),
  "NowPage",
);
const OpportunitiesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpportunitiesPage })),
  "OpportunitiesPage",
);
const ReferenceAssetsPage = lazyRetry(
  () => import("@/domains/creator-resources/ReferenceAssetsPage").then((module) => ({ default: module.ReferenceAssetsPage })),
  "ReferenceAssetsPage",
);
const WorksPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WorksPage })),
  "WorksPage",
);
const PolyHavenPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.PolyHavenPage })),
  "PolyHavenPage",
);
const GlobalBooksPage = lazyRetry(
  () => import("@/domains/creator-resources/GlobalBooksPage").then((module) => ({ default: module.GlobalBooksPage })),
  "GlobalBooksPage",
);
const RecipesPage = lazyRetry(
  () => import("@/domains/creator-resources/RecipesPage").then((module) => ({ default: module.RecipesPage })),
  "RecipesPage",
);
const StoryLabPage = lazyRetry(
  () => import("@/domains/creator-resources/StoryLabPage").then((module) => ({ default: module.StoryLabPage })),
  "StoryLabPage",
);
const OpenCreationPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenCreationPage").then((module) => ({ default: module.OpenCreationPage })),
  "OpenCreationPage",
);
const SourcesPage = lazyRetry(
  () => import("@/domains/creator-resources/SourcesPage").then((module) => ({ default: module.SourcesPage })),
  "SourcesPage",
);

const ContentPacksPage = lazyRetry(
  () => import("@/domains/creator-resources/ContentPacksPage").then((module) => ({ default: module.ContentPacksPage })),
  "ContentPacksPage",
);


export const creatorResourcesRoutes = defineAppRoutes([
  // Legacy creator hubs now resolve to the canonical ToonStudio front door.
  { id: "resources-make", path: "/make", element: <Navigate to="/studio/new" replace /> },
  { id: "resources-hub", path: "/creator-hub", element: <Navigate to="/studio" replace /> },
  { id: "resources-publishing", path: "/publishing", element: <Navigate to="/studio/publish" replace /> },

  // Research remains a public reference destination; project-bound references move into Story.
  { id: "resources-now", path: "/now", element: <NowPage /> },
  { id: "research-catalog", path: "/research/catalog", element: <CatalogResearchPage /> },
  { id: "research-catalog-notebook", path: "/research/catalog/notebook", element: <CatalogResearchPage /> },
  { id: "research-home", path: "/research", element: <CreatorHubPage /> },
  { id: "research-assets", path: "/research/assets", element: <ReferenceAssetsPage /> },
  { id: "research-open-creation", path: "/research/open-creation", element: <OpenCreationPage /> },
  { id: "research-content-packs", path: "/research/packs", element: <ContentPacksPage /> },
  { id: "research-books", path: "/research/books", element: <GlobalBooksPage /> },
  { id: "research-polyhaven", path: "/research/3d-assets", element: <PolyHavenPage /> },
  { id: "resources-references", path: "/creator-hub/references", element: <Navigate to="/research/assets" replace /> },
  { id: "resources-opportunities", path: "/opportunities", element: <OpportunitiesPage /> },
  { id: "resources-recipes", path: "/learn/recipes", element: <RecipesPage /> },
  { id: "resources-story", path: "/story-lab", element: <StoryLabPage /> },
  { id: "resources-works", path: "/discover/works", element: <WorksPage /> },
  { id: "resources-sources", path: "/insights/resources", element: <SourcesPage /> },

  // Historical aliases keep old links functional without competing for canonical ownership.
  { id: "resources-showcase", path: "/challenges", element: <Navigate to="/showcase/challenges" replace /> },
]);
