import { describe, it, expect } from "vitest";
import { searchTitles, suggest, sortTitles } from "../search";
import { makeTitle } from "./fixtures";

const titles = [
  makeTitle({ id: "a", title: "화산귀환", author: "비가", genres: ["무협"], tags: ["사이다"], type: "webnovel", stats: { ratingAvg: 4.9, views: 9_000_000 }, releaseYear: 2019 }),
  makeTitle({ id: "b", title: "전지적 독자 시점", author: "싱숑", genres: ["판타지"], type: "webtoon", stats: { ratingAvg: 4.8, views: 50_000_000 }, releaseYear: 2020, availability: [{ platformId: "kakao-page", pricing: "wait-free" }] }),
  makeTitle({ id: "c", title: "로맨스 작품", genres: ["로맨스"], type: "webtoon", stats: { ratingAvg: 3.2, views: 1000 }, releaseYear: 2024, availability: [{ platformId: "ridi", pricing: "paid" }] }),
];

describe("searchTitles", () => {
  it("제목 질의 매칭", () => {
    const r = searchTitles(titles, { q: "화산" });
    expect(r[0].id).toBe("a");
  });

  it("작가 질의 매칭", () => {
    expect(searchTitles(titles, { q: "싱숑" }).map((t) => t.id)).toContain("b");
  });

  it("유형 필터", () => {
    const r = searchTitles(titles, { types: ["webnovel"] });
    expect(r.map((t) => t.id)).toEqual(["a"]);
  });

  it("장르 필터", () => {
    expect(searchTitles(titles, { genres: ["로맨스"] }).map((t) => t.id)).toEqual(["c"]);
  });

  it("최소 평점 필터", () => {
    const r = searchTitles(titles, { minRating: 4.5 });
    expect(r.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("무료/기다무 필터", () => {
    const r = searchTitles(titles, { freeOnly: true });
    expect(r.map((t) => t.id).sort()).toEqual(["a", "b"]); // c는 paid 제외
  });

  it("플랫폼 필터", () => {
    expect(searchTitles(titles, { platforms: ["ridi"] }).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("sortTitles", () => {
  it("평점순", () => {
    expect(sortTitles(titles, "rating")[0].id).toBe("a");
  });
  it("인기순", () => {
    expect(sortTitles(titles, "popular")[0].id).toBe("b");
  });
  it("최신순", () => {
    expect(sortTitles(titles, "newest")[0].id).toBe("c");
  });
});

describe("suggest", () => {
  it("상위 매칭 반환", () => {
    const r = suggest(titles, "독자", 5);
    expect(r[0].id).toBe("b");
  });
  it("빈 질의는 빈 배열", () => {
    expect(suggest(titles, "")).toEqual([]);
  });
});
