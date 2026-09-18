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

export const marketingRoutes = defineAppRoutes([
  { id: "marketing-product-tour", path: "/product-tour", element: <ProductTourPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
]);
