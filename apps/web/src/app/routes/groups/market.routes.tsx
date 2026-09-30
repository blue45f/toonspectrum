import { defineAppRoutes } from "../app-route-definition";
import { resolveBreadcrumbTrail } from "../route-breadcrumb";

import { withRouteBreadcrumb } from "@/app/components/breadcrumb-route";
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
const MarketPublishAuthorityPage = lazyRetry(
  () => import("@/domains/market/pages/MarketPublishAuthorityPage").then((module) => ({ default: module.MarketPublishAuthorityPage })),
  "MarketPublishAuthorityPage",
);
const MarketOwnedResourcesPage = lazyRetry(
  () => import("@/domains/market/pages/MarketOwnedResourcesPage").then((module) => ({ default: module.MarketOwnedResourcesPage })),
  "MarketOwnedResourcesPage",
);
const MarketCloudLibraryPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCloudLibraryPage").then((module) => ({ default: module.MarketCloudLibraryPage })),
  "MarketCloudLibraryPage",
);
const MarketWishlistPage = lazyRetry(
  () => import("@/domains/market/pages/MarketWishlistPage").then((module) => ({ default: module.MarketWishlistPage })),
  "MarketWishlistPage",
);
const MarketComparePage = lazyRetry(
  () => import("@/domains/market/pages/MarketComparePage").then((module) => ({ default: module.MarketComparePage })),
  "MarketComparePage",
);
const MarketCheckoutPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCheckoutPage").then((module) => ({ default: module.MarketCheckoutPage })),
  "MarketCheckoutPage",
);

export const marketRoutes = defineAppRoutes([
  { id: "market-home", path: "/market", element: <MarketHomePage /> },
  { id: "market-browse", path: "/market/browse", element: withRouteBreadcrumb(resolveBreadcrumbTrail("/market/browse"), <MarketBrowsePage />) },
  { id: "market-fit", path: "/market/fit", element: <MarketFitLabPage /> },
  { id: "market-publish", path: "/market/publish", element: <MarketPublishAuthorityPage /> },
  { id: "market-manage", path: "/market/manage", element: <MarketOwnedResourcesPage /> },
  { id: "market-library", path: "/market/library", element: <MarketCloudLibraryPage /> },
  { id: "market-wishlist", path: "/market/wishlist", element: <MarketWishlistPage /> },
  { id: "market-compare", path: "/market/compare", element: <MarketComparePage /> },
  { id: "market-checkout", path: "/market/checkout/:id", element: <MarketCheckoutPage /> },
  { id: "market-resource", path: "/market/resource/:id", element: <MarketResourceDetailPage /> },
]);
