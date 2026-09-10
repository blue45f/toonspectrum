import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { preloadStudioI18nCore } from "@/domains/creator/studio-i18n-priority-loader";

function startStudioI18nCorePreload(): void {
  // Full-catalog compatibility API `loadStudioI18nDictionaries()` remains available for
  // explicit tooling. Route readiness intentionally starts only active-locale core strings.
  void preloadStudioI18nCore().catch(() => undefined);
}

const StudioMusicPage = lazyRetry(
  () => import("@/domains/creator/music/StudioMusicPage").then((module) => ({ default: module.StudioMusicPage })),
  "StudioMusicPage",
);
const CreateGalleryPage = lazyRetry(
  () => import("@/domains/creator/CreateGalleryPage").then((module) => ({ default: module.CreateGalleryPage })),
  "CreateGalleryPage",
);
const CreateWorkPage = lazyRetry(
  () => import("@/domains/creator/CreateWorkPage").then((module) => ({ default: module.CreateWorkPage })),
  "CreateWorkPage",
);
const CreateSeriesPage = lazyRetry(
  () => import("@/domains/creator/CreateSeriesPage").then((module) => ({ default: module.CreateSeriesPage })),
  "CreateSeriesPage",
);
const CreateChallengesPage = lazyRetry(
  () => import("@/domains/creator/CreateChallengesPage").then((module) => ({ default: module.CreateChallengesPage })),
  "CreateChallengesPage",
);
const StudioPromoPage = lazyRetry(
  () => import("@/domains/creator/promo/StudioPromoPage").then((module) => ({ default: module.StudioPromoPage })),
  "StudioPromoPage",
);
const CharacterShaperLandingPage = lazyRetry(
  () => import("@/domains/creator/CharacterShaperLandingPage").then((module) => ({
    default: module.CharacterShaperLandingPage,
  })),
  "CharacterShaperLandingPage",
);
const StudioBrushLabPage = lazyRetry(
  () => {
    startStudioI18nCorePreload();
    return import("@/domains/creator/brush-lab/StudioBrushLabPage").then((module) => ({
      default: module.StudioBrushLabPage,
    }));
  },
  "StudioBrushLabPage",
);
const StudioHomePage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioHomePage,
  })),
  "StudioHomePage",
);
const StudioNewPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioNewPage,
  })),
  "StudioNewPage",
);
const StudioImportPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioImportPage,
  })),
  "StudioImportPage",
);
const StudioAssetsPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioAssetsPage,
  })),
  "StudioAssetsPage",
);
const LearnPage = lazyRetry(
  () => import("@/domains/learn/LearnPage").then((module) => ({ default: module.LearnPage })),
  "LearnPage",
);
// Public reference pages must not initialize the editor or its dictionaries/GPU engines.
const StudioManualPage = lazyRetry(
  () => import("@/domains/creator/manual/StudioManualPage").then((module) => ({
    default: module.StudioManualPage,
  })),
  "StudioManualPage",
);
const StudioRouter = lazyRetry(
  () => {
    startStudioI18nCorePreload();
    return import("@/domains/creator/studio-router/StudioRouter").then((module) => ({
      default: module.StudioRouter,
    }));
  },
  "StudioRouter",
);

export const creatorRoutes = defineAppRoutes([
  // Canonical ToonStudio front door. Exact routes intentionally precede the editor wildcard.
  { id: "creator-studio-home", path: "/studio", element: <StudioHomePage /> },
  { id: "creator-studio-new", path: "/studio/new", element: <StudioNewPage /> },
  { id: "creator-studio-import", path: "/studio/import", element: <StudioImportPage /> },
  { id: "creator-studio-assets", path: "/studio/assets", element: <StudioAssetsPage /> },
  { id: "creator-studio-assets-brushes", path: "/studio/assets/brushes", element: <Navigate to="/studio/brushes" replace /> },
  { id: "creator-studio-assets-brush-new", path: "/studio/assets/brushes/new", element: <StudioBrushLabPage /> },
  { id: "creator-studio-assets-character-new", path: "/studio/assets/characters/new", element: <CharacterShaperLandingPage /> },
  { id: "creator-studio-assets-audio", path: "/studio/assets/audio", element: <StudioMusicPage /> },
  { id: "creator-studio-assets-3d", path: "/studio/assets/3d", element: <Navigate to="/studio/bg3d" replace /> },
  { id: "creator-studio-templates", path: "/studio/templates", element: <Navigate to="/market?view=templates" replace /> },

  // Canonical showcase routes retain the existing gallery implementation.
  { id: "creator-showcase", path: "/showcase", element: <CreateGalleryPage /> },
  { id: "creator-showcase-challenges", path: "/showcase/challenges", element: <CreateChallengesPage /> },
  { id: "creator-showcase-promo", path: "/showcase/promo", element: <StudioPromoPage /> },
  { id: "creator-showcase-series", path: "/showcase/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-showcase-work", path: "/showcase/work/:id", element: <CreateWorkPage /> },

  // Legacy public tool routes now enter the unified Studio asset structure.
  { id: "creator-music", path: "/music", element: <Navigate to="/studio/assets/audio" replace /> },
  { id: "creator-character-shaper", path: "/shaper", element: <Navigate to="/studio/assets/characters/new" replace /> },
  { id: "creator-brush-lab", path: "/brush-lab", element: <Navigate to="/studio/assets/brushes/new" replace /> },
  { id: "creator-studio-brush-lab", path: "/studio/brush-lab", element: <Navigate to="/studio/assets/brushes/new" replace /> },

  // Existing public gallery URLs remain compatible while links migrate to /showcase.
  { id: "creator-gallery", path: "/create", element: <CreateGalleryPage /> },
  { id: "creator-challenges", path: "/create/challenges", element: <CreateChallengesPage /> },
  { id: "creator-promo", path: "/create/promo", element: <StudioPromoPage /> },
  { id: "creator-series", path: "/create/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-work", path: "/create/:id", element: <CreateWorkPage /> },

  // Work/remix brush-lab URLs keep their scoped editor state until document-id migration lands.
  { id: "creator-studio-work-brush-lab", path: "/studio/work/:workId/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-studio-remix-brush-lab", path: "/studio/remix/:sourceWorkId/brush-lab", element: <StudioBrushLabPage /> },

  { id: "creator-learning", path: "/learn/*", element: <LearnPage /> },
  { id: "creator-studio-manual", path: "/studio/manual", element: <StudioManualPage /> },
  { id: "creator-studio-manual-article", path: "/studio/manual/:articleId", element: <StudioManualPage /> },

  // /studio/canvas and all scoped editor/production routes continue through the established router.
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
]);
