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

export const TeamWorkspacePage = lazyRetry(
  () => import("@/domains/creator/production-hub/TeamWorkspacePage").then((module) => ({ default: module.TeamWorkspacePage })),
  "TeamWorkspacePage",
);
export const TeamWorkspaceJoinPage = lazyRetry(
  () => import("@/domains/creator/production-hub/TeamWorkspacePage").then((module) => ({ default: module.TeamWorkspaceJoinPage })),
  "TeamWorkspaceJoinPage",
);
