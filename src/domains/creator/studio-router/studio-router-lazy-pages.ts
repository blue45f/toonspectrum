// Lazy Studio route pages, kept out of StudioRouter so the router stays a small
// composition seam (see studio-host-architecture-ratchet).
import { lazyRetry } from "@/lib/lazy-retry";

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

export const StudioStoryworldLabPage = lazyRetry(
  () => import("../storyworld/StudioStoryworldLabPage").then((module) => ({
    default: module.StudioStoryworldLabPage,
  })),
  "StudioStoryworldLabPage",
);

