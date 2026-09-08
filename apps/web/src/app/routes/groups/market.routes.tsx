import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const MarketHomePage = lazyRetry(
  () => import("@/domains/market/pages/MarketHomePage").then((module) => ({ default: module.MarketHomePage })),
  "MarketHomePage",
);
const MarketBrowsePage = lazyRetry(
  () => import("@/domains/market/pages/MarketBrowsePage").then((module) => ({ default: module.MarketBrowsePage })),
  "MarketBrowsePage",
);
const MarketFitLabPage = lazyRetry(
  () => import("@/domains/market/pages/MarketFitLabPage").then((module) => ({ default: module.MarketFitLabPage })),
  "MarketFitLabPage",
);
const MarketResourceDetailPage = lazyRetry(
  () => import("@/domains/market/pages/MarketResourceDetailPage").then((module) => ({ default: module.MarketResourceDetailPage })),
  "MarketResourceDetailPage",
);
const MarketPublishPage = lazyRetry(
  () => import("@/domains/market/pages/MarketPublishAuthorityPage").then((module) => ({ default: module.MarketPublishPage })),
  "MarketPublishPage",
);
const MarketManagePage = lazyRetry(
  () => import("@/domains/market/pages/MarketOwnedResourcesPage").then((module) => ({ default: module.MarketManagePage })),
  "MarketManagePage",
);
const MarketLibraryPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCloudLibraryPage").then((module) => ({ default: module.MarketLibraryPage })),
  "MarketLibraryPage",
);
const MarketWishlistPage = lazyRetry(
  () => import("@/domains/market/pages/MarketWishlistPage").then((module) => ({ default: module.MarketWishlistPage })),
  "MarketWishlistPage",
);
const MarketComparePage = lazyRetry(
  () => import("@/domains/market/pages/MarketComparePage").then((module) => ({ default: module.MarketComparePage })),
  "MarketComparePage",
);

export const marketRoutes = defineAppRoutes([
  { id: "market-home", path: "/market", element: <MarketHomePage /> },
  { id: "market-browse", path: "/market/browse", element: <MarketBrowsePage /> },
  { id: "market-fit", path: "/market/fit", element: <MarketFitLabPage /> },
  { id: "market-publish", path: "/market/publish", element: <MarketPublishPage /> },
  { id: "market-manage", path: "/market/manage", element: <MarketManagePage /> },
  { id: "market-library", path: "/market/library", element: <MarketLibraryPage /> },
  { id: "market-wishlist", path: "/market/wishlist", element: <MarketWishlistPage /> },
  { id: "market-compare", path: "/market/compare", element: <MarketComparePage /> },
  { id: "market-resource", path: "/market/resource/:id", element: <MarketResourceDetailPage /> },
]);
