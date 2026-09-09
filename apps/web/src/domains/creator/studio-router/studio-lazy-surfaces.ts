import { lazyRetry } from "@/shared/lib/lazy-retry";

export const StudioLift3dPage = lazyRetry(
  () => import("../lift3d/StudioLift3dPage").then((module) => ({
    default: module.StudioLift3dPage,
  })),
  "StudioLift3dPage",
);

export const StudioToolsCompanionPage = lazyRetry(
  () => import("../StudioToolsCompanionPage").then((module) => ({
    default: module.StudioToolsCompanionPage,
  })),
  "StudioToolsCompanionPage",
);

export const StudioAiComicDirectorRoute = lazyRetry(
  () => import("./routes/StudioAiComicDirectorRoute").then((module) => ({
    default: module.StudioAiComicDirectorRoute,
  })),
  "StudioAiComicDirectorRoute",
);
