import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { PageIntro } from "@/shared/components/page-intro/PageIntro";

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
  // 운세 도구별 하위 라우트 — 탭이던 도구 8종이 각자 URL을 가져 딥링크·공유·뒤로가기가 된다.
  { id: "experience-fortune-today", path: "/fortune/today", element: <FortunePage tool="today" /> },
  { id: "experience-fortune-monthly", path: "/fortune/monthly", element: <FortunePage tool="monthly" /> },
  { id: "experience-fortune-yearly", path: "/fortune/yearly", element: <FortunePage tool="yearly" /> },
  { id: "experience-fortune-zodiac", path: "/fortune/zodiac", element: <FortunePage tool="zodiac" /> },
  { id: "experience-fortune-saju", path: "/fortune/saju", element: <FortunePage tool="saju" /> },
  { id: "experience-fortune-compatibility", path: "/fortune/compatibility", element: <FortunePage tool="compatibility" /> },
  { id: "experience-fortune-prescription", path: "/fortune/prescription", element: <FortunePage tool="prescription" /> },
  { id: "experience-fortune-tarot", path: "/fortune/tarot", element: <FortunePage tool="tarot" /> },
  { id: "experience-play", path: "/play", element: <PageIntro variant="play"><PlayPage /></PageIntro> },
]);
