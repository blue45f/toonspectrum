import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/lib/lazy-retry";
import { loadStudioI18nDictionaries } from "@/src/domains/creator/studio-i18n-loader";

const CreateGalleryPage = lazyRetry(
  () => import("@/src/domains/creator/CreateGalleryPage").then((module) => ({ default: module.CreateGalleryPage })),
  "CreateGalleryPage",
);
const CreateWorkPage = lazyRetry(
  () => import("@/src/domains/creator/CreateWorkPage").then((module) => ({ default: module.CreateWorkPage })),
  "CreateWorkPage",
);
const CreateSeriesPage = lazyRetry(
  () => import("@/src/domains/creator/CreateSeriesPage").then((module) => ({ default: module.CreateSeriesPage })),
  "CreateSeriesPage",
);
const CreateChallengesPage = lazyRetry(
  () => import("@/src/domains/creator/CreateChallengesPage").then((module) => ({ default: module.CreateChallengesPage })),
  "CreateChallengesPage",
);
const CharacterShaperLandingPage = lazyRetry(
  () => import("@/src/domains/creator/CharacterShaperLandingPage").then((module) => ({
    default: module.CharacterShaperLandingPage,
  })),
  "CharacterShaperLandingPage",
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

export const creatorRoutes = defineAppRoutes([
  { id: "creator-gallery", path: "/create", element: <CreateGalleryPage /> },
  { id: "creator-challenges", path: "/create/challenges", element: <CreateChallengesPage /> },
  { id: "creator-series", path: "/create/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-work", path: "/create/:id", element: <CreateWorkPage /> },
  { id: "creator-character-shaper", path: "/shaper", element: <CharacterShaperLandingPage /> },
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
]);
