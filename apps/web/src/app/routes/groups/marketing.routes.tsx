import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const ProductTourPage = lazyRetry(
  () => import("@/domains/marketing/ProductTourPage").then((module) => ({
    default: module.ProductTourPage,
  })),
  "ProductTourPage",
);

const BrandFilmPage = lazyRetry(
  () => import("@/domains/marketing/BrandFilmPage").then((module) => ({
    default: module.BrandFilmPage,
  })),
  "BrandFilmPage",
);

const EventsHubPage = lazyRetry(
  () => import("@/domains/marketing/events/EventsHubPage").then((module) => ({
    default: module.EventsHubPage,
  })),
  "EventsHubPage",
);

const BetaOpenEventPage = lazyRetry(
  () => import("@/domains/marketing/events/BetaOpenEventPage").then((module) => ({
    default: module.BetaOpenEventPage,
  })),
  "BetaOpenEventPage",
);

export const marketingRoutes = defineAppRoutes([
  { id: "marketing-product-tour", path: "/product-tour", element: <ProductTourPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
  { id: "marketing-events", path: "/events", element: <EventsHubPage /> },
  { id: "marketing-event-beta-open", path: "/events/beta-open", element: <BetaOpenEventPage /> },
]);
