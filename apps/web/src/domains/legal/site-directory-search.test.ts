import { describe, expect, it } from "vitest";

import { searchSiteDirectory, type SiteDirectoryEntry } from "./site-directory-search";

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
