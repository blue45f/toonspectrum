import { TITLES, adaptationsOf, activeTags } from "./catalog-store";
import { PLATFORM_LIST } from "../platforms";
import { GENRES, WEEK_DAYS } from "../taxonomy";
import { rankBy } from "../ranking";
import { sortTitles } from "../search";
import { kstDayOfWeek } from "../utils";
import { getReviewGlobalStats } from "./reviews";

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
