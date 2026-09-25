import { lazyRetry } from "@/shared/lib/lazy-retry";

export const ProductionLandingPage = lazyRetry(
  () => import("@/domains/creator/production-hub/ProductionLandingPage").then((module) => ({
    default: module.ProductionLandingPage,
  })),
  "ProductionLandingPage",
);

export const ProductionProjectPage = lazyRetry(
  () => import("@/domains/creator/production-hub/ProductionHubPage").then((module) => ({
    default: module.ProductionProjectPage,
  })),
  "ProductionProjectPage",
);

export const ProductionEpisodeRoomPage = lazyRetry(
  () => import("@/domains/creator/production-hub/ProductionHubPage").then((module) => ({
    default: module.ProductionEpisodeRoomPage,
  })),
  "ProductionEpisodeRoomPage",
);

export const ProductionExternalReviewPage = lazyRetry(
  () => import("@/domains/creator/production-hub/ProductionExternalReviewPage").then((module) => ({
    default: module.ProductionExternalReviewPage,
  })),
  "ProductionExternalReviewPage",
);

export const StudioPinnedReviewSharePage = lazyRetry(
  () => import("@/domains/creator/review-share/StudioPinnedReviewSharePage").then((module) => ({
    default: module.StudioPinnedReviewSharePage,
  })),
  "StudioPinnedReviewSharePage",
);

export const TeamPeoplePage = lazyRetry(
  () => import("@/domains/creator/production-hub/TeamPeoplePage").then((module) => ({ default: module.TeamPeoplePage })),
  "TeamPeoplePage",
);
export const TeamWorkspacePage = lazyRetry(
  () => import("@/domains/creator/production-hub/TeamWorkspacePage").then((module) => ({ default: module.TeamWorkspacePage })),
  "TeamWorkspacePage",
);
export const TeamWorkspaceJoinPage = lazyRetry(
  () => import("@/domains/creator/production-hub/TeamWorkspacePage").then((module) => ({ default: module.TeamWorkspaceJoinPage })),
  "TeamWorkspaceJoinPage",
);
