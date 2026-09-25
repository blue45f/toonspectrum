import { describe, expect, it } from "vitest";

import { filterSiteDirectory, searchSiteDirectory, type SiteDirectoryEntry } from "./site-directory-search";

const entries: SiteDirectoryEntry[] = [
  { href: "/learn/records", label: { ko: "학습 기록", en: "Learning records" }, description: { ko: "학습 진행 백업 복원", en: "Back up progress" } },
  { href: "/market", label: { ko: "소재 마켓", en: "Market" }, description: { ko: "브러시 찾기", en: "Find brushes and materials" } },
  { href: "/support", label: { ko: "이용 문의", en: "Support" }, description: { ko: "기능 도움", en: "Help with learning records" } },
];

describe("local directory search", () => {
  it.each(["학습 기록", "LEARNING records", " ｌｅａｒｎｉｎｇ  records ", "/learn/records"])("matches normalized query %s", (query) => {
    expect(searchSiteDirectory(entries, query)[0].href).toBe("/learn/records");
  });
  it("matches every word across both languages and descriptions", () => {
    expect(searchSiteDirectory(entries, "마켓 brushes").map((item) => item.href)).toEqual(["/market"]);
    expect(searchSiteDirectory(entries, "마켓 없는말")).toEqual([]);
  });
  it("prioritizes exact titles before description matches and deduplicates URLs", () => {
    expect(searchSiteDirectory([...entries, entries[0]], "Learning records").map((item) => item.href)).toEqual(["/learn/records", "/support"]);
  });
  it.each(["", "  ", "unknown-menu-xyz"])("handles empty or unmatched input %s", (query) => {
    expect(searchSiteDirectory(entries, query)).toEqual([]);
  });
});


describe("directory metadata filters", () => {
  it("filters by product, maturity and access without a text query", () => {
    const richerEntries: SiteDirectoryEntry[] = [
      ...entries,
      { href: "/studio/bg3d", label: { ko: "3D 배경", en: "3D backgrounds" }, description: { ko: "장면", en: "Scenes" } },
      { href: "/privacy", label: { ko: "개인정보", en: "Privacy" }, description: { ko: "정책", en: "Policy" } },
    ];
    expect(filterSiteDirectory(richerEntries, "", { product: "studio", maturity: "beta" }).map((item) => item.href)).toEqual(["/studio/bg3d"]);
    expect(filterSiteDirectory(richerEntries, "", { product: "docs" }).map((item) => item.href)).toEqual(["/support", "/privacy"]);
    expect(filterSiteDirectory(richerEntries, "", { tier: "core" }).map((item) => item.href)).toEqual(["/studio/bg3d"]);
    expect(filterSiteDirectory(richerEntries, "", { tier: "ecosystem" }).map((item) => item.href)).toEqual(["/learn/records", "/market", "/support", "/privacy"]);
  });

  it("normalizes aliases and supports a favorites-only view", () => {
    const aliased: SiteDirectoryEntry[] = [
      { href: "/publishing", label: { ko: "출판", en: "Publishing" }, description: { ko: "게시", en: "Publish" } },
      { href: "/ranking", label: { ko: "랭킹", en: "Ranking" }, description: { ko: "순위", en: "Ranks" } },
    ];
    expect(filterSiteDirectory(aliased, "", { favoritesOnly: true, favorites: ["/studio/publish"] }).map((item) => item.href)).toEqual(["/studio/publish"]);
  });
});
