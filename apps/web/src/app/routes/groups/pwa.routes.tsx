import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const PwaInstallShowcasePage = lazyRetry(
  () => import("@/shared/pwa/PwaInstallShowcase").then((module) => ({
    default: module.PwaInstallShowcasePage,
  })),
  "PwaInstallShowcasePage",
);

const PwaOfflinePage = lazyRetry(
  () => import("@/shared/pwa/PwaOfflinePage").then((module) => ({
    default: module.PwaOfflinePage,
  })),
  "PwaOfflinePage",
);

export const pwaRoutes = defineAppRoutes([
  { id: "pwa-install", path: "/install", element: <PwaInstallShowcasePage /> },
  { id: "pwa-offline", path: "/offline", element: <PwaOfflinePage /> },
]);
