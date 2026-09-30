import { describe, expect, it } from "vitest";

import { helpSearchTokens, rankHelpItems, rankRelatedScreens, scoreHelpFields } from "./help-search";
import { SITEMAP_DIRECTORY_ENTRIES } from "./site-directory-data";

describe("helpSearchTokens", () => {
  it.each([
    ["저장이 안 돼요", ["저장"]],
    ["로그인이 안 돼요", ["로그인"]],
    ["브러시가 안 보여요", ["브러시"]],
    ["에셋 라이선스", ["에셋", "라이선스"]],
    ["말풍선", ["말풍선"]],
    ["save failed", ["save"]],
    ["Speech balloon?", ["speech", "balloon"]],
  ])("turns %j into meaningful keywords", (query, expected) => {
    expect(helpSearchTokens(query)).toEqual(expected);
  });

  it("keeps short nouns whose last syllable looks like a particle", () => {
    // '작가'의 '가', '효과'의 '과'를 조사로 떼면 한 글자가 되므로 그대로 둔다.
    expect(helpSearchTokens("작가 효과")).toEqual(["작가", "효과"]);
  });

  it("drops one-letter words, duplicates and phrases that only describe the problem", () => {
    expect(helpSearchTokens("안 돼요 왜 안돼요")).toEqual([]);
    expect(helpSearchTokens("저장 저장이 저장을")).toEqual(["저장"]);
    expect(helpSearchTokens("a 3")).toEqual([]);
  });
});

describe("rankHelpItems", () => {
  const items = [
    { id: "studio", primary: ["Studio 사용법"], secondary: ["브러시 말풍선 레이어"] },
    { id: "brush", primary: ["브러시 설치"], secondary: ["마켓"] },
    { id: "account", primary: ["계정"], secondary: ["로그인"] },
  ];
  const fields = (item: (typeof items)[number]) => ({ primary: item.primary, secondary: item.secondary });

  it("shows an item when any keyword matches, ranking title matches first", () => {
    expect(rankHelpItems(items, fields, ["브러시"]).map((item) => item.id)).toEqual(["brush", "studio"]);
    expect(scoreHelpFields(fields(items[0]!), ["브러시", "말풍선"])).toBe(2);
    expect(scoreHelpFields(fields(items[1]!), ["브러시", "마켓"])).toBe(3);
  });

  it("returns everything when the query has no meaningful keyword", () => {
    expect(rankHelpItems(items, fields, [])).toHaveLength(3);
  });

  it("drops items without any match", () => {
    expect(rankHelpItems(items, fields, ["존재하지않는낱말"])).toEqual([]);
  });
});

describe("rankRelatedScreens", () => {
  it("finds site destinations by name or description and skips excluded paths", () => {
    const related = rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, ["상태"]);
    expect(related.map((entry) => entry.href)).toContain("/status");
    const excluded = rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, ["상태"], new Set(["/status"]));
    expect(excluded.map((entry) => entry.href)).not.toContain("/status");
  });

  it("caps the list and ignores tokens that match nothing", () => {
    expect(rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, ["웹툰"], new Set(), 4).length).toBeLessThanOrEqual(4);
    expect(rankRelatedScreens(SITEMAP_DIRECTORY_ENTRIES, ["zzzz없는말"])).toEqual([]);
  });
});
