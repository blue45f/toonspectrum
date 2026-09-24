import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const NotificationCenterPage = lazyRetry(
  () => import("@/domains/engagement/NotificationCenterPage").then((module) => ({ default: module.NotificationCenterPage })),
  "NotificationCenterPage",
);
const TasteOnboardingPage = lazyRetry(
  () => import("@/domains/engagement/TasteOnboardingPage").then((module) => ({ default: module.TasteOnboardingPage })),
  "TasteOnboardingPage",
);
const PublicCollectionPage = lazyRetry(
  () => import("@/domains/engagement/PublicCollectionPage").then((module) => ({ default: module.PublicCollectionPage })),
  "PublicCollectionPage",
);

export const engagementRoutes = defineAppRoutes([
  { id: "engagement-notifications", path: "/notifications", element: <NotificationCenterPage /> },
  { id: "engagement-taste-onboarding", path: "/onboarding/taste", element: <TasteOnboardingPage /> },
  { id: "engagement-public-list", path: "/lists/:slug", element: <PublicCollectionPage /> },
]);
