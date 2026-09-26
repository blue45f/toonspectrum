// ranking·search·taxonomy·calendar 는 core 동급 모듈(브라우저-세이프)이라 sibling import.
// 리뷰 총계는 drizzle/db 를 쓰는 서버 전용 read-model(apps/api/src/server/reviews)이라 이 패키지가 앱 트리로
// climb 하지 않고 호출자가 loadReviewStats 로 주입한다 — 화살표는 앱 → 패키지 한 방향만 남는다.
import { kstTodayIdx } from "../calendar";
import { PLATFORM_LIST } from "../platforms";
import { rankBy } from "../ranking";
import { sortTitles } from "../search";
import { GENRES, WEEK_DAYS } from "../taxonomy";

import { TITLES, adaptationsOf, activeTags, getCatalogState } from "./catalog-store";

export type HomeReviewStats = { total: number };

export type HomeDataDeps = {
  // Keep the DB-derived count outside the shared catalog cache.
  loadReviewStats: () => Promise<HomeReviewStats>;
};

const HOME_CATALOG_TTL_MS = 30_000;
let homeCatalogCache: {
  titles: typeof TITLES;
  revision: number;
  todayDay: string;
  createdAt: number;
  data: ReturnType<typeof buildHomeCatalogData>;
} | null = null;

function buildHomeCatalogData(todayDay: typeof WEEK_DAYS[number]) {
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
  const todayReleases = TITLES.filter(
    (t) => t.type === "webtoon" && t.status === "ongoing" && t.updateDays?.includes(todayDay)
  )
    .sort((a, b) => b.stats.views - a.stats.views)
    .slice(0, 12);

  return {
    featured, spotlight, topRated, waitFree, newest, families, tags,
    todayDay, todayReleases,
    stats: { titles: TITLES.length, platforms: PLATFORM_LIST.length, genres: GENRES.length },
  };
}

export async function getHomeData(deps: HomeDataDeps) {
  const now = Date.now();
  const todayDay = WEEK_DAYS[kstTodayIdx()];
  const revision = getCatalogState().revision;
  let cached = homeCatalogCache;
  if (
    !cached || cached.titles !== TITLES || cached.revision !== revision
    || cached.todayDay !== todayDay || now < cached.createdAt
    || now - cached.createdAt >= HOME_CATALOG_TTL_MS
  ) {
    cached = { titles: TITLES, revision, todayDay, createdAt: now, data: buildHomeCatalogData(todayDay) };
    homeCatalogCache = cached;
  }
  const data = cached.data;
  // Capture the catalog snapshot before awaiting the independently changing count.
  const reviewStats = await deps.loadReviewStats();
  return {
    // Copy collection containers so consumers cannot reorder or empty the cache.
    // Title objects remain shared, as in the original read-model contract.
    featured: [...data.featured],
    spotlight: data.spotlight,
    topRated: [...data.topRated],
    waitFree: [...data.waitFree],
    newest: [...data.newest],
    families: data.families.map((family) => ({ ...family, adaptations: [...family.adaptations] })),
    tags: data.tags.map((tag) => ({ ...tag })),
    todayDay: data.todayDay,
    todayReleases: [...data.todayReleases],
    genres: GENRES,
    stats: { ...data.stats, reviews: reviewStats.total },
    generatedAt: new Date().toISOString(),
  };
}
