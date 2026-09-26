import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getHomeData } from "./home";

import type { Title } from "../types";

const model = vi.hoisted(() => ({ titles: [] as Title[], revision: 0, day: 0, ranks: vi.fn() }));
vi.mock("../calendar", () => ({ kstTodayIdx: () => model.day }));
vi.mock("../platforms", () => ({ PLATFORM_LIST: [{}] }));
vi.mock("../taxonomy", () => ({ GENRES: ["판타지"], WEEK_DAYS: ["월", "화", "수", "목", "금", "토", "일"] }));
vi.mock("../ranking", () => ({ rankBy: () => { model.ranks(); return model.titles.map((title) => ({ title })); } }));
vi.mock("./catalog-store", () => ({
  get TITLES() { return model.titles; },
  getCatalogState: () => ({ revision: model.revision }),
  adaptationsOf: () => [],
  activeTags: () => [{ tag: "성장", count: 1 }],
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-12T00:00:00Z"));
  model.ranks.mockClear();
  model.revision += 1;
  model.day = 0;
  model.titles = [{
    id: "one", slug: "one", type: "webtoon", title: "작품", author: "작가",
    tags: ["성장"], genres: ["판타지"], synopsis: "설명", cover: ["#000", "#fff"],
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    featured: true, status: "ongoing", ageRating: "all", releaseYear: 2026, updateDays: ["월"],
    stats: { views: 10, likes: 0, bookmarks: 0, ratingAvg: 4, ratingCount: 1,
      ratingDist: [0, 0, 0, 1, 0], rankDelta: 0, trendingScore: 1, completionRate: 50, bingeIndex: 0 },
  }];
});
afterEach(() => vi.useRealTimers());

 describe("home catalog CPU cache", () => {
  it("reuses catalog work but reloads review counts for each concurrent request", async () => {
    const loadReviewStats = vi.fn().mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 2 });
    const [first, second] = await Promise.all([getHomeData({ loadReviewStats }), getHomeData({ loadReviewStats })]);
    expect(model.ranks).toHaveBeenCalledTimes(1);
    expect(first.stats.reviews).toBe(1);
    expect(second.stats.reviews).toBe(2);
  });
  it("invalidates on revision, catalog identity and Korean weekday changes", async () => {
    const deps = { loadReviewStats: async () => ({ total: 0 }) };
    await getHomeData(deps);
    model.revision += 1;
    await getHomeData(deps);
    model.titles = [...model.titles];
    await getHomeData(deps);
    model.day = 1;
    const nextDay = await getHomeData(deps);
    expect(model.ranks).toHaveBeenCalledTimes(4);
    expect(nextDay.todayDay).toBe("화");
    expect(nextDay.todayReleases).toEqual([]);
  });
  it("expires at 30 seconds and handles clock rollback", async () => {
    const deps = { loadReviewStats: async () => ({ total: 0 }) };
    await getHomeData(deps);
    vi.setSystemTime(Date.now() + 29_999);
    await getHomeData(deps);
    expect(model.ranks).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    await getHomeData(deps);
    vi.setSystemTime(Date.now() - 1);
    await getHomeData(deps);
    expect(model.ranks).toHaveBeenCalledTimes(3);
  });
  it("does not let a caller corrupt cached collection containers", async () => {
    const deps = { loadReviewStats: async () => ({ total: 0 }) };
    const first = await getHomeData(deps);
    first.featured.length = 0;
    first.tags[0].count = 999;
    const second = await getHomeData(deps);
    expect(second.featured).toHaveLength(1);
    expect(second.tags[0].count).toBe(1);
  });
  it("propagates review failures and retries the independent count", async () => {
    await expect(getHomeData({ loadReviewStats: async () => { throw new Error("review unavailable"); } })).rejects.toThrow("review unavailable");
    expect((await getHomeData({ loadReviewStats: async () => ({ total: 7 }) })).stats.reviews).toBe(7);
    expect(model.ranks).toHaveBeenCalledTimes(1);
  });
});
