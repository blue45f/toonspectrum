/**
 * monetization.routes.tsx
 *
 * 수익화 4종 라우트: 수익 대시보드, 얼리 액세스, 멤버십.
 */
import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const CreatorRevenueDashboardPage = lazyRetry(
  () => import("@/domains/monetization/revenue/pages/CreatorRevenueDashboardPage").then((module) => ({ default: module.CreatorRevenueDashboardPage })),
  "CreatorRevenueDashboardPage",
);
const CreatorEarlyAccessPage = lazyRetry(
  () => import("@/domains/monetization/paywall/pages/CreatorEarlyAccessPage").then((module) => ({ default: module.CreatorEarlyAccessPage })),
  "CreatorEarlyAccessPage",
);
const CreatorMembershipPage = lazyRetry(
  () => import("@/domains/monetization/membership/pages/CreatorMembershipPage").then((module) => ({ default: module.CreatorMembershipPage })),
  "CreatorMembershipPage",
);
const MyMembershipsPage = lazyRetry(
  () => import("@/domains/monetization/membership/pages/MyMembershipsPage").then((module) => ({ default: module.MyMembershipsPage })),
  "MyMembershipsPage",
);

export const monetizationRoutes = defineAppRoutes([
  { id: "monetization-creator-revenue", path: "/creator/revenue", element: <CreatorRevenueDashboardPage /> },
  { id: "monetization-creator-early-access", path: "/creator/early-access", element: <CreatorEarlyAccessPage /> },
  { id: "monetization-creator-membership", path: "/creator/membership", element: <CreatorMembershipPage /> },
  { id: "monetization-my-memberships", path: "/memberships", element: <MyMembershipsPage /> },
]);
