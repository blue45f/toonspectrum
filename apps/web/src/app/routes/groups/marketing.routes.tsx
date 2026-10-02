import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { WorkspaceHomeRoute } from "@/domains/creator/workspace/WorkspaceHomeRoute";
import { ComicIntroHost } from "@/domains/marketing/comic-intro/ComicIntroHost";

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

const PricingPage = lazyRetry(
  () => import("@/app/routes/pricing-page").then((module) => ({
    default: module.PricingPage,
  })),
  "PricingPage",
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
  { id: "workspace-home", path: "/home", element: <WorkspaceHomeRoute><ComicIntroHost /><StudioWorkspacePage /></WorkspaceHomeRoute> },
  { id: "workspace-team", path: "/team", element: <WorkspaceHomeRoute><StudioWorkspacePage surface="team" /></WorkspaceHomeRoute> },
  { id: "workspace-hub", path: "/hub", element: <WorkspaceHomeRoute><StudioWorkspacePage surface="hub" /></WorkspaceHomeRoute> },
  { id: "marketing-product-tour", path: "/product-tour", element: <ProductTourPage /> },
  { id: "marketing-membership", path: "/membership", element: <MembershipPolicyPage /> },
  // 내비게이션 팀이 헤더/푸터에서 연결할 공개 요금제 안내. 상세 한도는 /membership이 소유한다.
  { id: "marketing-pricing", path: "/pricing", element: <PricingPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
  { id: "marketing-events", path: "/events", element: <EventsHubPage /> },
  { id: "marketing-event-beta-open", path: "/events/beta-open", element: <BetaOpenEventPage /> },
]);
