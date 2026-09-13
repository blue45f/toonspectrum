import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const ReviewsPage = lazyRetry(
  () => import("@/domains/community/ReviewsPage").then((module) => ({ default: module.ReviewsPage })),
  "ReviewsPage",
);
const CommunityPage = lazyRetry(
  () => import("@/domains/community/CommunityPage").then((module) => ({ default: module.CommunityPage })),
  "CommunityPage",
);
const CommunityScopePage = lazyRetry(
  () => import("@/domains/community/CommunityPage").then((module) => ({ default: module.CommunityScopePage })),
  "CommunityScopePage",
);
const CafesPage = lazyRetry(
  () => import("@/domains/community/CafesPage").then((module) => ({ default: module.CafesPage })),
  "CafesPage",
);
const CafeDetailPage = lazyRetry(
  () => import("@/domains/community/CafeDetailPage").then((module) => ({ default: module.CafeDetailPage })),
  "CafeDetailPage",
);
const CommunityPostPage = lazyRetry(
  () => import("@/domains/community/CommunityPostPage").then((module) => ({ default: module.CommunityPostPage })),
  "CommunityPostPage",
);
const PencafePage = lazyRetry(
  () => import("@/domains/community/PencafePage").then((module) => ({ default: module.PencafePage })),
  "PencafePage",
);
const PromotionBoardPage = lazyRetry(
  () => import("@/domains/promotion/PromotionBoardPage").then((module) => ({ default: module.PromotionBoardPage })),
  "PromotionBoardPage",
);
const PromotionEditorPage = lazyRetry(
  () => import("@/domains/promotion/PromotionEditorPage").then((module) => ({ default: module.PromotionEditorPage })),
  "PromotionEditorPage",
);
const PromotionPostPage = lazyRetry(
  () => import("@/domains/promotion/PromotionPostPage").then((module) => ({ default: module.PromotionPostPage })),
  "PromotionPostPage",
);
const PromotionModerationPage = lazyRetry(
  () => import("@/domains/promotion/PromotionModerationPage").then((module) => ({ default: module.PromotionModerationPage })),
  "PromotionModerationPage",
);

const CollaborationBoardPage = lazyRetry(() => import("@/domains/collaboration/CollaborationBoardPage").then((module) => ({ default: module.CollaborationBoardPage })), "CollaborationBoardPage");
const CollaborationEditorPage = lazyRetry(() => import("@/domains/collaboration/CollaborationEditorPage").then((module) => ({ default: module.CollaborationEditorPage })), "CollaborationEditorPage");
const CollaborationPostPage = lazyRetry(() => import("@/domains/collaboration/CollaborationPostPage").then((module) => ({ default: module.CollaborationPostPage })), "CollaborationPostPage");
const CollaborationModerationPage = lazyRetry(() => import("@/domains/collaboration/CollaborationModerationPage").then((module) => ({ default: module.CollaborationModerationPage })), "CollaborationModerationPage");

export const communityRoutes = defineAppRoutes([
  { id: "collaboration-board", path: "/collaborate", element: <CollaborationBoardPage /> },
  { id: "collaboration-new", path: "/collaborate/new", element: <CollaborationEditorPage /> },
  { id: "collaboration-moderation", path: "/collaborate/moderation", element: <CollaborationModerationPage /> },
  { id: "collaboration-edit", path: "/collaborate/:id/edit", element: <CollaborationEditorPage /> },
  { id: "collaboration-post", path: "/collaborate/:id", element: <CollaborationPostPage /> },
  { id: "community-reviews", path: "/reviews", element: <ReviewsPage /> },
  { id: "community-home", path: "/community", element: <CommunityPage /> },
  { id: "community-promote-home", path: "/community/promote", element: <PromotionBoardPage /> },
  { id: "community-promote-new", path: "/community/promote/new", element: <PromotionEditorPage /> },
  { id: "community-promote-moderation", path: "/community/promote/moderation", element: <PromotionModerationPage /> },
  { id: "community-promote-edit", path: "/community/promote/:id/edit", element: <PromotionEditorPage /> },
  { id: "community-promote-post", path: "/community/promote/:id", element: <PromotionPostPage /> },
  { id: "community-cafes", path: "/community/cafes", element: <CafesPage /> },
  { id: "community-cafe", path: "/community/cafes/:slug", element: <CafeDetailPage /> },
  { id: "community-post", path: "/community/post/:id", element: <CommunityPostPage /> },
  { id: "community-scope", path: "/community/:scope", element: <CommunityScopePage /> },
  { id: "community-pencafe", path: "/pencafe/:name", element: <PencafePage /> },
]);
