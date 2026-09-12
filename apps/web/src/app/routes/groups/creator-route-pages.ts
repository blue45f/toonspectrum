import { preloadStudioI18nCore } from "@/domains/creator/studio-i18n-priority-loader";
import { lazyRetry } from "@/shared/lib/lazy-retry";

/** Preload only the locale core required before an immersive Studio route mounts. */
function startStudioI18nCorePreload(): void {
  // Full-catalog compatibility API `loadStudioI18nDictionaries()` remains available for
  // explicit tooling. Route readiness intentionally starts only active-locale core strings.
  void preloadStudioI18nCore().catch(() => undefined);
}

export const StudioMusicPage = lazyRetry(
  () => import("@/domains/creator/music/StudioMusicPage").then((module) => ({
    default: module.StudioMusicPage,
  })),
  "StudioMusicPage",
);
export const CreateGalleryPage = lazyRetry(
  () => import("@/domains/creator/CreateGalleryPage").then((module) => ({
    default: module.CreateGalleryPage,
  })),
  "CreateGalleryPage",
);
export const CreateWorkPage = lazyRetry(
  () => import("@/domains/creator/CreateWorkPage").then((module) => ({
    default: module.CreateWorkPage,
  })),
  "CreateWorkPage",
);
export const CreateSeriesPage = lazyRetry(
  () => import("@/domains/creator/CreateSeriesPage").then((module) => ({
    default: module.CreateSeriesPage,
  })),
  "CreateSeriesPage",
);
export const CreateChallengesPage = lazyRetry(
  () => import("@/domains/creator/CreateChallengesPage").then((module) => ({
    default: module.CreateChallengesPage,
  })),
  "CreateChallengesPage",
);
export const StudioPromoPage = lazyRetry(
  () => import("@/domains/creator/promo/StudioPromoPage").then((module) => ({
    default: module.StudioPromoPage,
  })),
  "StudioPromoPage",
);
export const CharacterShaperLandingPage = lazyRetry(
  () => import("@/domains/creator/CharacterShaperLandingPage").then((module) => ({
    default: module.CharacterShaperLandingPage,
  })),
  "CharacterShaperLandingPage",
);
export const StudioBrushLabPage = lazyRetry(
  () => {
    startStudioI18nCorePreload();
    return import("@/domains/creator/brush-lab/StudioBrushLabPage").then((module) => ({
      default: module.StudioBrushLabPage,
    }));
  },
  "StudioBrushLabPage",
);
export const StudioHomePage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioProjectLibraryPage").then((module) => ({
    default: module.StudioProjectLibraryPage,
  })),
  "StudioProjectLibraryPage",
);
export const StudioNewPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioNewIntegratedPage").then((module) => ({
    default: module.StudioNewIntegratedPage,
  })),
  "StudioNewIntegratedPage",
);

export const StudioTemplatesPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioTemplatesPage").then((module) => ({
    default: module.StudioTemplatesPage,
  })),
  "StudioTemplatesPage",
);
export const StudioImportPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioImportIntegratedPage").then((module) => ({
    default: module.StudioImportIntegratedPage,
  })),
  "StudioImportIntegratedPage",
);
export const StudioAssetsPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioFrontDoorPages").then((module) => ({
    default: module.StudioAssetsPage,
  })),
  "StudioAssetsPage",
);
export const StudioAssetHubPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioAssetHubPage").then((module) => ({
    default: module.StudioAssetHubPage,
  })),
  "StudioAssetHubPage",
);
export const StudioProjectShellPage = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioProjectIntegratedPage").then((module) => ({
    default: module.StudioProjectIntegratedPage,
  })),
  "StudioProjectIntegratedPage",
);
export const StudioDocumentWorkspaceRoute = lazyRetry(
  () => import("@/domains/creator/studio-shell/StudioDocumentWorkspaceRoute").then((module) => ({
    default: module.StudioDocumentWorkspaceRoute,
  })),
  "StudioDocumentWorkspaceRoute",
);
export const LearnPage = lazyRetry(
  () => import("@/domains/learn/LearnPage").then((module) => ({
    default: module.LearnPage,
  })),
  "LearnPage",
);
// Public reference pages must not initialize the editor or its dictionaries/GPU engines.
export const StudioManualPage = lazyRetry(
  () => import("@/domains/creator/manual/StudioManualPage").then((module) => ({
    default: module.StudioManualPage,
  })),
  "StudioManualPage",
);
export const StudioRouter = lazyRetry(
  () => {
    startStudioI18nCorePreload();
    return import("@/domains/creator/studio-router/StudioRouter").then((module) => ({
      default: module.StudioRouter,
    }));
  },
  "StudioRouter",
);
