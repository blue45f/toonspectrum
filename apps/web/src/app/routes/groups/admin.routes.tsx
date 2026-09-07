import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const AdminRouter = lazyRetry(
  () => import("@/src/domains/admin/router/AdminRouter").then((module) => ({
    default: module.AdminRouter,
  })),
  "AdminRouter",
);

export const adminRoutes = defineAppRoutes([
  { id: "admin", path: "/admin/*", element: <AdminRouter /> },
]);
