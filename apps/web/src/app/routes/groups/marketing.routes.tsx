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

const MembershipPolicyPage = lazyRetry(
  () => import("@/domains/marketing/MembershipPolicyPage").then((module) => ({
    default: module.MembershipPolicyPage,
  })),
  "MembershipPolicyPage",
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

const StudioWorkspacePage = lazyRetry(
  () => import("@/domains/creator/workspace/StudioWorkspacePage").then((module) => ({ default: module.StudioWorkspacePage })),
  "StudioWorkspacePage",
);

const StudioIntroductionPage = lazyRetry(
  () => import("@/domains/marketing/CreatorHomeExperience").then((module) => ({ default: module.CreatorHomeExperience })),
  "StudioIntroductionPage",
);

export const marketingRoutes = defineAppRoutes([
  { id: "marketing-studio-introduction", path: "/about/studio", element: <StudioIntroductionPage /> },
  { id: "workspace-home", path: "/home", element: <StudioWorkspacePage /> },
  { id: "workspace-team", path: "/team", element: <StudioWorkspacePage surface="team" /> },
  { id: "workspace-hub", path: "/hub", element: <StudioWorkspacePage surface="hub" /> },
  { id: "marketing-product-tour", path: "/product-tour", element: <ProductTourPage /> },
  { id: "marketing-membership", path: "/membership", element: <MembershipPolicyPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
  { id: "marketing-events", path: "/events", element: <EventsHubPage /> },
  { id: "marketing-event-beta-open", path: "/events/beta-open", element: <BetaOpenEventPage /> },
]);
