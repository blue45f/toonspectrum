import { TITLES, activeTags, adaptationsOf, titlesByType } from "./catalog-store";
import { PLATFORMS, PRICING_LABEL } from "../platforms";
import { TYPE_LABEL } from "../taxonomy";
import type { Pricing, Title } from "../types";

// 불량 카탈로그값(NaN/Infinity, 크롤 파싱 오류)이 섞여도 평균이 깨지지 않도록 유한값만 집계.
const avg = (ns: number[]) => {
  const valid = ns.filter((n) => Number.isFinite(n));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
};

const PRICING_COLOR: Record<Pricing, string> = {
  free: "var(--color-good)",
  "wait-free": "var(--color-cool)",
  paid: "var(--color-accent)",
  subscription: "var(--color-warn)",
};

export async function getInsightsData() {
  const total = TITLES.length;

  const genreAgg = new Map<string, { count: number; ratings: number[] }>();
  TITLES.forEach((t) =>
    t.genres.forEach((g) => {
      const e = genreAgg.get(g) ?? { count: 0, ratings: [] };
      e.count += 1;
      e.ratings.push(t.stats.ratingAvg);
      genreAgg.set(g, e);
    })
  );
  const genreRows = Array.from(genreAgg.entries())
    .map(([genre, e]) => ({ genre, count: e.count, rating: avg(e.ratings) }))
    .sort((a, b) => b.count - a.count);
  const topGenre = genreRows[0];
  const bestRatedGenre = [...genreRows].sort((a, b) => b.rating - a.rating)[0];

  const webtoons = titlesByType("webtoon");
  const webnovels = titlesByType("webnovel");
  const grp = (ts: Title[]) => ({
    count: ts.length,
    rating: avg(ts.map((t) => t.stats.ratingAvg)),
    views: avg(ts.map((t) => t.stats.views)),
    binge: avg(ts.map((t) => t.stats.bingeIndex)),
  });
  const wt = grp(webtoons);
  const wn = grp(webnovels);

  const platformCount = new Map<string, number>();
  TITLES.forEach((t) => {
    const seen = new Set<string>();
    t.availability.forEach((a) => {
      if (seen.has(a.platformId)) return;
      seen.add(a.platformId);
      platformCount.set(a.platformId, (platformCount.get(a.platformId) ?? 0) + 1);
    });
  });
  const platformRows = Array.from(platformCount.entries())
    .map(([id, count]) => ({ id, count, p: PLATFORMS[id as keyof typeof PLATFORMS] }))
    .filter((r) => r.p)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const topPlatform = platformRows[0];

  const yearCount = new Map<number, number>();
  TITLES.forEach((t) => yearCount.set(t.releaseYear, (yearCount.get(t.releaseYear) ?? 0) + 1));
  const years = Array.from(yearCount.keys()).sort((a, b) => a - b);
  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const yearPoints = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearPoints.push({ label: y, value: yearCount.get(y) ?? 0 });
  }
  const peakYear = [...yearPoints].sort((a, b) => b.value - a.value)[0];

  const distTotal: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  TITLES.forEach((t) =>
    t.stats.ratingDist.forEach((v, i) => {
      // 일부 카탈로그 항목의 분포값이 음수/비정상(크롤 파싱 오류)일 수 있어 방어적으로 클램프.
      // 미보정 시 집계 평가 수가 음수로 표시됨(라이브 인사이트 버그).
      if (i < 5 && Number.isFinite(v) && v > 0) distTotal[i] += v;
    })
  );
  const distSum = distTotal.reduce((a, b) => a + b, 0);
  const weightedAvg = distSum
    ? distTotal.reduce((acc, v, i) => acc + v * (i + 1), 0) / distSum
    : 0;
  const fourPlusPct = distSum ? ((distTotal[3] + distTotal[4]) / distSum) * 100 : 0;

  const pricingCount: Record<Pricing, number> = {
    free: 0,
    "wait-free": 0,
    paid: 0,
    subscription: 0,
  };
  TITLES.forEach((t) => t.availability.forEach((a) => (pricingCount[a.pricing] += 1)));
  const pricingTotal = Object.values(pricingCount).reduce((a, b) => a + b, 0);
  const pricingSegments = (["free", "wait-free", "paid", "subscription"] as Pricing[]).map((p) => ({
    label: PRICING_LABEL[p],
    value: pricingCount[p],
    color: PRICING_COLOR[p],
  }));
  const freeShare = pricingTotal
    ? ((pricingCount.free + pricingCount["wait-free"]) / pricingTotal) * 100
    : 0;

  const adaptedNovels = webnovels.filter((n) => adaptationsOf(n).length > 0);
  const adaptPct = webnovels.length ? (adaptedNovels.length / webnovels.length) * 100 : 0;

  const tags = activeTags();
  const trendingTop = [...TITLES].sort((a, b) => b.stats.trendingScore - a.stats.trendingScore).slice(0, 6);
  const completionTop = [...TITLES].sort((a, b) => b.stats.completionRate - a.stats.completionRate).slice(0, 6);

  return {
    total,
    genreRows,
    topGenre,
    bestRatedGenre,
    wt,
    wn,
    typeLabels: TYPE_LABEL,
    platformRows,
    topPlatform,
    platformTotal: platformCount.size,
    yearPoints,
    peakYear,
    distTotal,
    distSum,
    weightedAvg,
    fourPlusPct,
    pricingTotal,
    pricingSegments,
    freeShare,
    webnovelsCount: webnovels.length,
    adaptedNovelsCount: adaptedNovels.length,
    adaptPct,
    tags,
    trendingTop,
    completionTop,
    generatedAt: new Date().toISOString(),
    source: "server-catalog",
  };
}
