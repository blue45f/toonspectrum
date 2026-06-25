// ranking·search·taxonomy·calendar 는 core 동급 모듈(브라우저-세이프)이라 sibling import. reviews 는
// drizzle/db 를 쓰는 서버 전용이라 웹 레포 lib/server/ 에서 climb 한다(웹은 getHomeData 를 value 로
// import 안 해 번들 미유입).
import { getReviewGlobalStats } from "../../../../lib/server/reviews";
import { kstTodayIdx } from "../calendar";
import { PLATFORM_LIST } from "../platforms";
import { rankBy } from "../ranking";
import { sortTitles } from "../search";
import { GENRES, WEEK_DAYS } from "../taxonomy";

import { TITLES, adaptationsOf, activeTags } from "./catalog-store";

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
  const todayDay = WEEK_DAYS[kstTodayIdx()];
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
