import { TITLES, SEED_REVIEWS, activeTags, adaptationsOf } from "@/lib/data";
import { rankBy } from "@/lib/ranking";
import { sortTitles } from "@/lib/search";
import { WEEK_DAYS } from "@/lib/taxonomy";
import type { Title } from "@/lib/types";
import { kstDayOfWeek } from "@/lib/utils";

const DAY_IDX_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5];

export function homeSnapshot() {
  const featured = TITLES.filter((title) => title.featured);
  const spotlight = [...featured].sort((a, b) => b.stats.views - a.stats.views)[0] ?? null;
  const topRated = rankBy(TITLES, "rating", { limit: 12 }).map((rank) => rank.title);
  const waitFree = sortTitles(
    TITLES.filter((title) =>
      title.availability.some((entry) => entry.pricing === "free" || entry.pricing === "wait-free")
    ),
    "popular"
  ).slice(0, 12);
  const newest = sortTitles(TITLES, "newest").slice(0, 12);
  const families = TITLES.filter((title) => title.type === "webnovel" && adaptationsOf(title).length > 0)
    .map((original) => ({ original, adaptations: adaptationsOf(original) }))
    .sort((a, b) => b.original.stats.views - a.original.stats.views)
    .slice(0, 3);
  const todayIdx = DAY_IDX_FROM_GETDAY[kstDayOfWeek()];
  const todayDay = WEEK_DAYS[todayIdx];
  const todayReleases = TITLES.filter(
    (title) => title.type === "webtoon" && title.status === "ongoing" && title.updateDays?.includes(todayDay)
  )
    .sort((a, b) => b.stats.views - a.stats.views)
    .slice(0, 12);

  return {
    featured,
    spotlight,
    topRated,
    waitFree,
    newest,
    families,
    tags: activeTags().slice(0, 14),
    todayDay,
    todayReleases,
    stats: {
      titles: TITLES.length,
      platforms: new Set(TITLES.flatMap((title) => title.availability.map((entry) => entry.platformId))).size,
      genres: new Set(TITLES.flatMap((title) => title.genres)).size,
      reviews: SEED_REVIEWS.length,
    },
  };
}

export function calendarSnapshot() {
  const todayIdx = DAY_IDX_FROM_GETDAY[kstDayOfWeek()];
  const ongoing = TITLES.filter(
    (title) => title.type === "webtoon" && title.status === "ongoing" && title.updateDays?.length
  );
  const byDay = WEEK_DAYS.map((day) =>
    ongoing
      .filter((title) => title.updateDays!.includes(day))
      .sort((a, b) => b.stats.views - a.stats.views)
  );

  return {
    todayIdx,
    todayDay: WEEK_DAYS[todayIdx],
    todayCount: byDay[todayIdx]?.length ?? 0,
    days: WEEK_DAYS.map((day, i) => ({ day, items: byDay[i] })),
  };
}

export function similarLocalTitles(title: Title, limit = 8) {
  const genreSet = new Set(title.genres);
  const tagSet = new Set(title.tags);
  return TITLES.filter((item) => item.id !== title.id)
    .map((item) => {
      const genreScore = item.genres.filter((genre) => genreSet.has(genre)).length * 3;
      const tagScore = item.tags.filter((tag) => tagSet.has(tag)).length;
      const typeScore = item.type === title.type ? 1 : 0;
      return { item, score: genreScore + tagScore + typeScore + item.stats.ratingAvg / 10 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.stats.views - a.item.stats.views)
    .slice(0, limit)
    .map((entry) => entry.item);
}
