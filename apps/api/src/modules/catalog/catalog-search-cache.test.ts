import { describe, expect, it } from "vitest";

import { searchFixture } from "../../../../../packages/core/src/__tests__/search-fixture";
import { CatalogSearchCache } from "./catalog-search-cache";

describe("bounded public search result cache", () => {
  it("reuses the same computation for another page and maintains full aggregates", () => {
    const titles = searchFixture(); const cache = new CatalogSearchCache();
    const first = cache.get(titles, { q: "story" }, "popular", 1);
    expect(cache.get(titles, { q: "story" }, "popular", 1)).toBe(first);
    expect(first.items).toHaveLength(160);
    expect(first.typeCount).toEqual({ webtoon: 80, webnovel: 80 });
  });
  it("invalidates on catalog replacement, revision, TTL and a backwards clock", () => {
    let now = 100; const cache = new CatalogSearchCache(() => now); const titles = searchFixture();
    const one = cache.get(titles, {}, "popular", 1);
    now = 30_100; const two = cache.get(titles, {}, "popular", 1); expect(two).not.toBe(one);
    now = 90; expect(cache.get(titles, {}, "popular", 1)).not.toBe(two);
    const three = cache.get(titles, {}, "popular", 2); expect(three).not.toBe(two);
    expect(cache.get([...titles], {}, "popular", 2)).not.toBe(three);
  });
  it("bypasses and clears cache during request-time mutable enrichment", () => {
    const titles = searchFixture(); const cache = new CatalogSearchCache();
    const cached = cache.get(titles, {}, "popular", 1);
    const fresh = cache.get(titles, {}, "popular", 1, false);
    expect(fresh).not.toBe(cached);
    expect(cache.get(titles, {}, "popular", 1)).not.toBe(cached);
  });
  it("bounds distinct queries and keys saved collections by contents", () => {
    const titles = searchFixture(); const cache = new CatalogSearchCache();
    const first = cache.get(titles, { ids: new Set(["work-1", "work-2"]) }, "popular", 1);
    expect(cache.get(titles, { ids: new Set(["work-2", "work-1"]) }, "popular", 1)).toBe(first);
    for (let i = 0; i < 16; i++) cache.get(titles, { q: `term-${i}` }, "popular", 1);
    expect(cache.get(titles, { ids: new Set(["work-1", "work-2"]) }, "popular", 1)).not.toBe(first);
  });
});
