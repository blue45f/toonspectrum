// ranking·search·taxonomy·calendar 는 core 동급 모듈(브라우저-세이프)이라 sibling import.
// 리뷰 총계는 drizzle/db 를 쓰는 서버 전용 read-model(apps/api/src/server/reviews)이라 이 패키지가 앱 트리로
// climb 하지 않고 호출자가 loadReviewStats 로 주입한다 — 화살표는 앱 → 패키지 한 방향만 남는다.
import { kstTodayIdx } from "../calendar";
import { PLATFORM_LIST } from "../platforms";
import { rankBy } from "../ranking";
import { sortTitles } from "../search";
import { GENRES, WEEK_DAYS } from "../taxonomy";

import { TITLES, adaptationsOf, activeTags } from "./catalog-store";

// 홈 read-model 이 필요로 하는 리뷰 총계의 최소 형태. apps/api/src/server/reviews 의 getReviewGlobalStats 가
// 이 형태를 만족하지만(추가 필드는 무시), core 는 그 구현도 DB 도 알지 못한다.
export type HomeReviewStats = { total: number };

export type HomeDataDeps = {
  // 앱 레이어가 소유한 DB read-model 을 주입한다. 선택 파라미터가 아니라 필수로 두어,
  // 주입을 빠뜨린 호출자가 조용히 "리뷰 0건" 을 렌더하는 대신 컴파일에서 걸리게 한다.
  loadReviewStats: () => Promise<HomeReviewStats>;
};

export async function getHomeData(deps: HomeDataDeps) {
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
  const reviewStats = await deps.loadReviewStats();

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
