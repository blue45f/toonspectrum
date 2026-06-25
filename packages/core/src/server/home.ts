// ranking·search·taxonomy·utils 는 core 미이전(브라우저-세이프)이라 웹 레포 lib/ 에서 climb. reviews 는
// drizzle/db 를 쓰는 서버 전용이라 lib/server/ 에 남는다(웹은 getHomeData 를 value 로 import 안 해 번들 미유입).
import { rankBy } from "../../../../lib/ranking";
import { sortTitles } from "../../../../lib/search";
import { getReviewGlobalStats } from "../../../../lib/server/reviews";
import { GENRES, WEEK_DAYS } from "../../../../lib/taxonomy";
import { kstDayOfWeek } from "../../../../lib/utils";
import { PLATFORM_LIST } from "../platforms";

import { TITLES, adaptationsOf, activeTags } from "./catalog-store";

const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5];

export async function getHomeData() {
  const featured = TITLES.filter((t) => t.featured);
  const spotlight = [...featured].sort((a, b) => b.stats.views - a.stats.views)[0] ?? null;
  const topRated = rankBy(TITLES, "rating", { limit: 12 }).map((r) => r.title);
  const waitFree = sortTitles(
    TITLES.filter((t) =>
      t.availability.some((a) => a.pricing === "free" || a.pricing === "wait-free")
    ),
    "popular"
  ).slice(0, 12);
  const newest = sortTitles(TITLES, "newest").slice(0, 12);
  const families = TITLES.filter((t) => t.type === "webnovel" && adaptationsOf(t).length > 0)
    .map((novel) => ({ original: novel, adaptations: adaptationsOf(novel) }))
    .sort((a, b) => b.original.stats.views - a.original.stats.views)
    .slice(0, 3);
  const tags = activeTags().slice(0, 14);
  const todayDay = WEEK_DAYS[DAY_IDX_FROM_GETDAY[kstDayOfWeek()]];
  const todayReleases = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.includes(todayDay)
  )
    .sort((a, b) => b.stats.views - a.stats.views)
    .slice(0, 12);
  const reviewStats = await getReviewGlobalStats();

  return {
    featured,
    spotlight,
    topRated,
    waitFree,
    newest,
    families,
    tags,
    todayDay,
    todayReleases,
    genres: GENRES,
    stats: {
      titles: TITLES.length,
      platforms: PLATFORM_LIST.length,
      genres: GENRES.length,
      reviews: reviewStats.total,
    },
    generatedAt: new Date().toISOString(),
  };
}
