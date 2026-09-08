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
  { id: "creator-music", path: "/music", element: <StudioMusicPage /> },
  { id: "creator-gallery", path: "/create", element: <CreateGalleryPage /> },
  { id: "creator-challenges", path: "/create/challenges", element: <CreateChallengesPage /> },
  { id: "creator-promo", path: "/create/promo", element: <StudioPromoPage /> },
  { id: "creator-series", path: "/create/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-work", path: "/create/:id", element: <CreateWorkPage /> },
  { id: "creator-character-shaper", path: "/shaper", element: <CharacterShaperLandingPage /> },
  { id: "creator-brush-lab", path: "/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-studio-brush-lab", path: "/studio/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-studio-work-brush-lab", path: "/studio/work/:workId/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-studio-remix-brush-lab", path: "/studio/remix/:sourceWorkId/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-learning", path: "/learn/*", element: <LearnPage /> },
  { id: "creator-studio-manual", path: "/studio/manual", element: <StudioManualPage /> },
  { id: "creator-studio-manual-article", path: "/studio/manual/:articleId", element: <StudioManualPage /> },
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
]);
