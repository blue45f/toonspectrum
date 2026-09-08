import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const FortunePage = lazyRetry(
  () => import("@/domains/fortune/FortunePage").then((module) => ({
    default: module.FortunePage,
  })),
  "FortunePage",
);
const PlayPage = lazyRetry(
  () => import("@/domains/play/PlayPage").then((module) => ({
    default: module.PlayPage,
  })),
  "PlayPage",
);

export const experienceRoutes = defineAppRoutes([
  { id: "experience-fortune", path: "/fortune", element: <FortunePage /> },
  { id: "experience-play", path: "/play", element: <PlayPage /> },
]);
