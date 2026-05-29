import { describe, it, expect } from "vitest";
import { rankBy } from "../ranking";
import { makeTitle } from "./fixtures";

describe("rankBy", () => {
  it("정렬: 인기축은 조회수 높은 작품이 위로", () => {
    const low = makeTitle({ id: "low", stats: { views: 1_000 } });
    const high = makeTitle({ id: "high", stats: { views: 500_000_000 } });
    const ranked = rankBy([low, high], "popular", { period: "all" });
    expect(ranked[0].title.id).toBe("high");
    expect(ranked[0].rank).toBe(1);
  });

  it("평점축: 베이즈 보정으로 표본 적은 만점작이 표본 많은 고득점작을 못 이긴다", () => {
    const fewPerfect = makeTitle({ id: "few", stats: { ratingAvg: 5.0, ratingCount: 30 } });
    const manyHigh = makeTitle({ id: "many", stats: { ratingAvg: 4.9, ratingCount: 50_000 } });
    const ranked = rankBy([fewPerfect, manyHigh], "rating", { period: "all" });
    expect(ranked[0].title.id).toBe("many");
  });

  it("완결축: 완결작만 포함", () => {
    const done = makeTitle({ id: "done", status: "completed" });
    const ongoing = makeTitle({ id: "ongoing", status: "ongoing" });
    const ranked = rankBy([done, ongoing], "completed", { period: "all" });
    expect(ranked.map((r) => r.title.id)).toEqual(["done"]);
  });

  it("신작축: 2022년 이후만 포함", () => {
    const fresh = makeTitle({ id: "fresh", releaseYear: 2024 });
    const old = makeTitle({ id: "old", releaseYear: 2015 });
    const ranked = rankBy([fresh, old], "rookie", { period: "all" });
    expect(ranked.map((r) => r.title.id)).toEqual(["fresh"]);
  });

  it("유형 필터: 웹소설만", () => {
    const toon = makeTitle({ id: "toon", type: "webtoon" });
    const novel = makeTitle({ id: "novel", type: "webnovel" });
    const ranked = rankBy([toon, novel], "popular", { period: "all", type: "webnovel" });
    expect(ranked.map((r) => r.title.id)).toEqual(["novel"]);
  });

  it("limit 적용", () => {
    const list = Array.from({ length: 10 }, (_, i) => makeTitle({ id: `n${i}` }));
    expect(rankBy(list, "popular", { period: "all", limit: 3 })).toHaveLength(3);
  });
});
