import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const BrandFilmPage = lazyRetry(
  () => import("@/domains/marketing/BrandFilmPage").then((module) => ({
    default: module.BrandFilmPage,
  })),
  "BrandFilmPage",
);

export const marketingRoutes = defineAppRoutes([
  {
    id: "marketing-brand-film",
    path: "/brand-film",
    element: <BrandFilmPage />,
  },
]);
