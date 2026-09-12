import { describe, expect, it } from "vitest";

import { searchTitles, sortTitles, suggest } from "./search";
import { normalizedSearchText } from "./search-normalization";

import type { SortKey } from "./search";
import type { Title } from "./types";

function title(index = 0): Title {
  return {
    id: String(index), slug: String(index), type: "webtoon", title: `학교 Romance ${index % 7}`,
    author: "김 작가", artist: "Lee", altTitles: ["Academy", "School Life"],
    genres: ["로맨스", "판타지"], tags: ["회 귀", "성장"], synopsis: "학교에서 성장하는 판타지 이야기 school life",
    cover: ["#000", "#fff"], status: "ongoing", ageRating: "all", releaseYear: 2020 + index % 5,
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: {
      views: index % 3, likes: 0, bookmarks: index % 4, ratingAvg: 4, ratingCount: index % 6,
      ratingDist: [0, 0, 0, 0, 0], rankDelta: 0, trendingScore: index % 5,
      completionRate: 50, bingeIndex: 0,
    },
  };
}

// Frozen scoring semantics from the pre-optimization implementation. This oracle
// deliberately normalizes afresh so cache bugs cannot make both paths agree.
function referenceScore(t: Title, q: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const nq = norm(q);
  const tokens = [...new Set([...q.split(/[\s,]+/).filter(Boolean).map(norm), nq].filter(Boolean))];
  if (!nq || !tokens.length) return 0;
  const name = norm(t.title);
  let value = 0;
  for (const tok of tokens) {
    if (name === tok) value += 120;
    else if (name.startsWith(tok)) value += 80;
    else if (name.includes(tok)) value += 55;
    if (t.altTitles?.some((s) => norm(s).includes(tok))) value += 45;
    if (norm(t.author + (t.artist ?? "")).includes(tok)) value += 35;
    if (t.tags.some((s) => norm(s).includes(tok)) || t.tags.map(norm).join("").includes(tok)) value += 22;
    if (t.genres.some((s) => norm(s).includes(tok)) || t.genres.map(norm).join("").includes(tok)) value += 18;
    if (t.synopsis && norm(t.synopsis).includes(tok)) value += 8;
  }
  if (name.includes(nq)) value += 30;
  return value;
}

 describe("search normalization cache", () => {
  it("reuses unchanged normalized fields", () => {
    const t = title();
    expect(normalizedSearchText(t)).toBe(normalizedSearchText(t));
  });
  it.each(["title", "author", "artist", "synopsis"] as const)("invalidates an in-place %s edit", (key) => {
    const t = title();
    const first = normalizedSearchText(t);
    t[key] = "바뀐 값";
    const second = normalizedSearchText(t);
    expect(second).not.toBe(first);
    expect(searchTitles([t], { q: "바뀐 값" })).toEqual([t]);
  });
  it.each(["tags", "genres", "altTitles"] as const)("invalidates in-place and replacement %s edits", (key) => {
    const t = title();
    const first = normalizedSearchText(t);
    t[key]!.push("새로운단어");
    expect(normalizedSearchText(t)).not.toBe(first);
    expect(searchTitles([t], { q: "새로운단어" })).toEqual([t]);
    t[key] = ["교체단어"];
    expect(searchTitles([t], { q: "새로운단어" })).toEqual([]);
    expect(searchTitles([t], { q: "교체단어" })).toEqual([t]);
  });
  it("preserves cold/warm scoring, stable ties and autocomplete in all sort modes", () => {
    const all = Array.from({ length: 60 }, (_, index) => title(index));
    const sorts: SortKey[] = ["relevance", "popular", "rating", "trending", "bookmarks", "completion", "newest", "title"];
    for (const q of ["학교", "romance", "School Life", "김 작가", "회귀성장", "로맨스판타지", "없는단어", "학교, romance"]) {
      const reference = all.map((t) => ({ t, score: referenceScore(t, q) }))
        .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.t);
      for (const sort of sorts) {
        const expected = sortTitles(reference, sort, q).map((t) => t.id);
        expect(searchTitles(all, { q }, sort).map((t) => t.id)).toEqual(expected);
        expect(searchTitles(all, { q }, sort).map((t) => t.id)).toEqual(expected);
      }
      expect(suggest(all, q, 6)).toEqual(reference.slice(0, 6));
    }
  });
  it("preserves input validation and empty-query behavior", () => {
    const all = [title(1), title(2)];
    expect(searchTitles(all, { q: "" }, "popular")).toEqual(sortTitles(all, "popular"));
    expect(suggest(all, " ")).toEqual([]);
    expect(() => searchTitles(all, { q: "x".repeat(513) })).toThrow(RangeError);
    expect(() => searchTitles(all, { q: [] as unknown as string })).toThrow(TypeError);
  });
});
