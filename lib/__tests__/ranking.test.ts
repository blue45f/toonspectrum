import { describe, it, expect } from "vitest";
import { rankBy, rankingItemListJsonLd } from "../ranking";
import { makeTitle } from "./fixtures";

describe("rankBy", () => {
  it("정렬: 인기축은 교차-플랫폼 인기 백분위가 높은 작품이 위로", () => {
    // 인기 점수는 플랫폼별로 정규화한 인기 백분위(popularityPercentile, 카탈로그 로드 시 계산)를
    // 지수감쇠로 반영한다 — 특정 플랫폼의 절대 조회수가 아니라 '플랫폼 내 상위권'을 본다.
    const low = makeTitle({ id: "low", stats: { popularityPercentile: 8 } });
    const high = makeTitle({ id: "high", stats: { popularityPercentile: 100 } });
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

  it("관심 폭발축: 관심(bookmarks) 많은 작품이 위로", () => {
    const a = makeTitle({ id: "a", stats: { bookmarks: 50 } });
    const b = makeTitle({ id: "b", stats: { bookmarks: 5_000_000 } });
    expect(rankBy([a, b], "favorites", { period: "all" })[0].title.id).toBe("b");
  });

  it("숨은 명작축: 같은 고평점이면 조회 적은 쪽이 위 + 평가 적으면 제외", () => {
    const lowViews = makeTitle({ id: "low", stats: { ratingAvg: 4.8, ratingCount: 5000, views: 10_000 } });
    const highViews = makeTitle({ id: "high", stats: { ratingAvg: 4.8, ratingCount: 5000, views: 500_000_000 } });
    const tooFew = makeTitle({ id: "few", stats: { ratingAvg: 5.0, ratingCount: 100, views: 1000 } });
    const ranked = rankBy([lowViews, highViews, tooFew], "hidden", { period: "all" });
    const ids = ranked.map((r) => r.title.id);
    expect(ids).not.toContain("few"); // ratingCount < 300 제외
    expect(ids.indexOf("low")).toBeLessThan(ids.indexOf("high"));
  });

  it("장르 필터: 해당 장르만", () => {
    const r = makeTitle({ id: "r", genres: ["로맨스"] });
    const f = makeTitle({ id: "f", genres: ["판타지"] });
    const ranked = rankBy([r, f], "popular", { period: "all", genre: "로맨스" });
    expect(ranked.map((x) => x.title.id)).toEqual(["r"]);
  });

  it("플랫폼 필터: 해당 플랫폼 가용성만", () => {
    const naver = makeTitle({ id: "n", availability: [{ platformId: "naver-webtoon", pricing: "free" }] });
    const kakao = makeTitle({ id: "k", availability: [{ platformId: "kakao-webtoon", pricing: "wait-free" }] });
    const ranked = rankBy([naver, kakao], "popular", { period: "all", platform: "kakao-webtoon" });
    expect(ranked.map((x) => x.title.id)).toEqual(["k"]);
  });
});

describe("rankingItemListJsonLd", () => {
  it("상위 20개만 순위 position + 절대 URL의 ListItem으로 변환한다", () => {
    const pool = Array.from({ length: 30 }, (_, i) => makeTitle({ id: `n${i}` }));
    const ranked = rankBy(pool, "popular", { period: "all" });
    const ld = rankingItemListJsonLd(ranked, "실시간 인기");
    expect(ld?.["@type"]).toBe("ItemList");
    expect(ld?.name).toBe("툰스펙트럼 통합 랭킹 · 실시간 인기");
    expect(ld?.numberOfItems).toBe(20);
    expect(ld?.itemListElement).toHaveLength(20);
    expect(ld?.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: ranked[0].title.title,
      url: `https://toonspectrum.vercel.app/title/${encodeURIComponent(ranked[0].title.slug)}`,
    });
  });

  it("한글 slug는 URL 인코딩되고, 빈 목록은 null(스크립트 미주입)", () => {
    const slug = "나 혼자만 레벨업";
    const ranked = rankBy([makeTitle({ id: "kr", slug })], "popular", { period: "all" });
    const url = rankingItemListJsonLd(ranked, "실시간 인기")?.itemListElement[0].url;
    expect(url).toBe(`https://toonspectrum.vercel.app/title/${encodeURIComponent(slug)}`);
    expect(url).not.toContain(" ");
    expect(rankingItemListJsonLd([], "실시간 인기")).toBeNull();
  });

  it("자체 산식 점수·평점 지표는 스키마에 넣지 않는다(외부 평점으로 오인 금지)", () => {
    const ranked = rankBy([makeTitle({ id: "honest" })], "popular", { period: "all" });
    const json = JSON.stringify(rankingItemListJsonLd(ranked, "실시간 인기"));
    expect(json).not.toContain("aggregateRating");
    expect(json).not.toContain("ratingValue");
    expect(json).not.toContain("score");
  });
});
