import { describe, expect, it } from "vitest";

import {
  MOBILE_SITE_TABS,
  PRIMARY_SITE_NAVIGATION,
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";

describe("site navigation information architecture", () => {
  it("organizes the full experience into four distinct user-purpose groups", () => {
    expect(SITE_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "create",
      "discover",
      "grow",
      "connect",
    ]);
    expect(SITE_NAVIGATION_GROUPS.find((group) => group.id === "create")?.items[0]).toBe(
      SITE_NAVIGATION_ITEMS.make,
    );

    const groupedItems = SITE_NAVIGATION_GROUPS.flatMap((group) => group.items);
    expect(new Set(groupedItems.map((item) => item.id)).size).toBe(groupedItems.length);
    expect(new Set(groupedItems.map((item) => item.href)).size).toBe(groupedItems.length);
  });

  it("keeps the desktop model small and the purpose-first Create hub as the center mobile action", () => {
    expect(PRIMARY_SITE_NAVIGATION.map((item) => item.id)).toEqual([
      "home",
      "explore",
      "community",
      "me",
    ]);
    expect(MOBILE_SITE_TABS.map((item) => item.id)).toEqual([
      "home",
      "explore",
      "make",
      "community",
      "me",
    ]);
    expect(MOBILE_SITE_TABS[2]).toBe(SITE_NAVIGATION_ITEMS.make);
  });

  it("keeps Help discoverable while leaving My library as the final utility focus destination", () => {
    expect(SITE_UTILITY_NAVIGATION[0]).toBe(SITE_NAVIGATION_ITEMS.help);
    expect(SITE_UTILITY_NAVIGATION.at(-1)).toBe(SITE_NAVIGATION_ITEMS.library);
  });

  it("provides complete Korean and English labels for every destination", () => {
    for (const item of Object.values(SITE_NAVIGATION_ITEMS)) {
      expect(item.href).toMatch(/^\//);
      expect(siteNavigationText(item.label, "ko-KR").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.label, "en-US").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "ko").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "en").length).toBeGreaterThan(0);
    }
    expect(siteNavigationLocale("KO_kr")).toBe("ko");
    expect(siteNavigationLocale("ja-JP")).toBe("en");
  });
});
