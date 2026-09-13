import { describe, expect, it } from "vitest";

import { MARKET_CURATED_THEMES, filterThemeResources } from "./market-theme";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

describe("market-theme", () => {
  it("defines curated themes with browse destinations that avoid known-empty live tags", () => {
    expect(MARKET_CURATED_THEMES.length).toBeGreaterThanOrEqual(4);
    const forbiddenEmptyLiveTags = new Set(["로판", "무기", "인체", "회차"]);
    for (const theme of MARKET_CURATED_THEMES) {
      expect(theme.id).toBeTruthy();
      expect(theme.title).toBeTruthy();
      expect(theme.tag).toBeTruthy();
      expect(theme.browseHref.startsWith("/market/browse")).toBe(true);
      expect(theme.icon).toBeDefined();
      expect(forbiddenEmptyLiveTags.has(theme.tag)).toBe(false);
      expect(theme.browseHref).not.toContain(encodeURIComponent("로판"));
      expect(theme.browseHref).not.toContain(encodeURIComponent("회차"));
    }
  });

  it("correctly filters resources matching theme tag", () => {
    const schoolItems = filterThemeResources(CREATOR_MARKETPLACE_STARTER_RECORDS, "학교");
    expect(schoolItems.length).toBeGreaterThan(0);
    expect(schoolItems.every((item) => item.tags.includes("학교"))).toBe(true);

    const missing = filterThemeResources(CREATOR_MARKETPLACE_STARTER_RECORDS, "존재하지않는태그");
    expect(missing).toHaveLength(0);
  });
});
