import { describe, expect, it } from "vitest";

import {
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  TOONSPECTRUM_MOBILE_TABS,
  TOONSPECTRUM_NAVIGATION_GROUPS,
  TOONSPECTRUM_PRIMARY_NAVIGATION,
  TOONSTUDIO_MOBILE_TABS,
  TOONSTUDIO_NAVIGATION_GROUPS,
  TOONSTUDIO_PRIMARY_NAVIGATION,
  mobileSiteTabsForPath,
  primarySiteNavigationForPath,
  siteNavigationContextForPath,
  siteNavigationGroupsForPath,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";

describe("site navigation information architecture", () => {
  it("separates creation and discovery into distinct product navigation", () => {
    expect(TOONSTUDIO_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "studio",
      "make",
      "studio-assets",
      "learn",
    ]);
    expect(TOONSPECTRUM_PRIMARY_NAVIGATION.map((item) => item.id)).toEqual([
      "explore",
      "ranking",
      "community",
      "library",
    ]);

    expect(SITE_NAVIGATION_ITEMS.studio.href).toBe("/studio");
    expect(SITE_NAVIGATION_ITEMS.make.href).toBe("/studio/new");
    expect(SITE_NAVIGATION_ITEMS.studioAssets.href).toBe("/studio/assets");
  });

  it("keeps the Studio drawer bounded while retaining all advanced destinations", () => {
    expect(TOONSTUDIO_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "studio-work",
      "studio-create",
      "studio-ecosystem",
    ]);
    expect(TOONSTUDIO_NAVIGATION_GROUPS[0]?.items).toEqual([
      SITE_NAVIGATION_ITEMS.studio,
      SITE_NAVIGATION_ITEMS.make,
      SITE_NAVIGATION_ITEMS.studioAssets,
      SITE_NAVIGATION_ITEMS.learn,
    ]);

    const groupedIds = TOONSTUDIO_NAVIGATION_GROUPS.flatMap((group) =>
      group.items.map((item) => item.id)
    );
    expect(groupedIds).toEqual(expect.arrayContaining([
      "studio",
      "make",
      "studio-assets",
      "learn",
      "comic",
      "shaper",
      "research",
      "market",
      "gallery",
      "opportunities",
    ]));
  });

  it("keeps the Spectrum drawer focused on discovery, community and personal history", () => {
    expect(TOONSPECTRUM_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "discover",
      "connect",
      "personal",
    ]);
    expect(TOONSPECTRUM_NAVIGATION_GROUPS[0]?.items[0]).toBe(
      SITE_NAVIGATION_ITEMS.explore,
    );
  });

  it("switches desktop and mobile navigation from the current product context", () => {
    expect(siteNavigationContextForPath("/studio")).toBe("studio");
    expect(siteNavigationContextForPath("/studio/canvas")).toBe("studio");
    expect(siteNavigationContextForPath("/studio/assets/brushes/new")).toBe("studio");
    expect(siteNavigationContextForPath("/learn/webtoon")).toBe("studio");
    expect(siteNavigationContextForPath("/market")).toBe("studio");
    expect(siteNavigationContextForPath("/discover")).toBe("spectrum");
    expect(siteNavigationContextForPath("/community")).toBe("spectrum");

    expect(primarySiteNavigationForPath("/studio")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/discover")).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(siteNavigationGroupsForPath("/studio")).toBe(TOONSTUDIO_NAVIGATION_GROUPS);
    expect(siteNavigationGroupsForPath("/discover")).toBe(TOONSPECTRUM_NAVIGATION_GROUPS);
    expect(mobileSiteTabsForPath("/studio")).toBe(TOONSTUDIO_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/discover")).toBe(TOONSPECTRUM_MOBILE_TABS);
  });

  it("uses stable five-slot mobile navigation in each product", () => {
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.id)).toEqual([
      "studio",
      "make",
      "studio-assets",
      "learn",
      "me",
    ]);
    expect(TOONSPECTRUM_MOBILE_TABS.map((item) => item.id)).toEqual([
      "home",
      "explore",
      "ranking",
      "community",
      "library",
    ]);
  });

  it("keeps Help, Settings and account destinations available from the utility area", () => {
    expect(SITE_UTILITY_NAVIGATION).toEqual([
      SITE_NAVIGATION_ITEMS.help,
      SITE_NAVIGATION_ITEMS.settings,
      SITE_NAVIGATION_ITEMS.me,
    ]);
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
