import { describe, expect, it } from "vitest";

import {
  PRIMARY_SITE_NAVIGATION,
  SITE_NAVIGATION_GROUPS,
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
      "workspace-home",
      "studio",
      "workspace-team",
      "workspace-hub",
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
    expect(SITE_NAVIGATION_ITEMS.learn.href).toBe("/learn");
    expect(SITE_NAVIGATION_ITEMS.studioAssets.label.ko).toBe("작품 재료");
    expect(SITE_NAVIGATION_ITEMS.production.href).toBe("/production");
    expect(SITE_NAVIGATION_ITEMS.publish.href).toBe("/studio/publish");
    expect(SITE_NAVIGATION_ITEMS.technology.href).toBe("/about/technology");
    expect(SITE_NAVIGATION_ITEMS.technology.label.ko).toBe("제작 기술");
    expect(SITE_NAVIGATION_ITEMS.research.label.ko).toBe("리서치 데스크");
    expect(SITE_NAVIGATION_ITEMS.market.label.ko).toBe("소재 마켓");
  });

  it("keeps fortune and tarot in Spectrum's research and growth directory", () => {
    const growItems = TOONSPECTRUM_NAVIGATION_GROUPS.find(
      (group) => group.id === "grow",
    )?.items;

    expect(growItems?.map((item) => item.id)).toEqual([
      "now",
      "fortune",
      "research",
      "market",
      "opportunities",
      "insights",
      "technology",
    ]);
    expect(SITE_NAVIGATION_ITEMS.fortune.href).toBe("/fortune");
    expect(SITE_NAVIGATION_ITEMS.fortune.label.ko).toContain("타로");
    expect(siteNavigationContextForPath("/fortune")).toBe("spectrum");
  });

  it("exposes the engineering story from both product drawers", () => {
    const studioResources = TOONSTUDIO_NAVIGATION_GROUPS.find(
      (group) => group.id === "production-resources",
    )?.items;
    const spectrumGrowth = TOONSPECTRUM_NAVIGATION_GROUPS.find(
      (group) => group.id === "grow",
    )?.items;

    expect(studioResources).toContain(SITE_NAVIGATION_ITEMS.technology);
    expect(spectrumGrowth).toContain(SITE_NAVIGATION_ITEMS.technology);
  });

  it("keeps compatibility exports attached to the Spectrum product context", () => {
    expect(PRIMARY_SITE_NAVIGATION).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(SITE_NAVIGATION_GROUPS).toBe(TOONSPECTRUM_NAVIGATION_GROUPS);
  });

  it("keeps the Spectrum drawer focused on discovery, growth, community and history", () => {
    expect(TOONSPECTRUM_NAVIGATION_GROUPS.map((group) => group.id)).toEqual([
      "discover",
      "grow",
      "connect",
      "personal",
    ]);
    expect(TOONSPECTRUM_NAVIGATION_GROUPS[0]?.items[0]).toBe(
      SITE_NAVIGATION_ITEMS.explore,
    );
  });

  it("switches desktop and mobile navigation from the current product context", () => {
    expect(siteNavigationContextForPath("/")).toBe("studio");
    expect(siteNavigationContextForPath("/studio")).toBe("studio");
    expect(siteNavigationContextForPath("/production")).toBe("studio");
    expect(siteNavigationContextForPath("/brand-film")).toBe("studio");
    expect(siteNavigationContextForPath("/about/technology")).toBe("studio");
    expect(siteNavigationContextForPath("/about/technology/story")).toBe("studio");
    expect(siteNavigationContextForPath("/production/projects/sample-project/overview")).toBe("studio");
    expect(siteNavigationContextForPath("/studio/canvas")).toBe("studio");
    expect(siteNavigationContextForPath("/studio/assets/brushes/new")).toBe("studio");
    expect(siteNavigationContextForPath("/learn/webtoon")).toBe("studio");
    expect(siteNavigationContextForPath("/help")).toBe("studio");
    expect(siteNavigationContextForPath("/help/getting-started")).toBe("studio");
    expect(siteNavigationContextForPath("/market")).toBe("studio");
    expect(siteNavigationContextForPath("/showcase")).toBe("studio");
    expect(siteNavigationContextForPath("/collaborate")).toBe("studio");
    expect(siteNavigationContextForPath("/now")).toBe("studio");
    expect(siteNavigationContextForPath("/references")).toBe("studio");
    expect(siteNavigationContextForPath("/make")).toBe("studio");
    expect(siteNavigationContextForPath("/publishing")).toBe("studio");
    expect(siteNavigationContextForPath("/shaper")).toBe("studio");
    expect(siteNavigationContextForPath("/music")).toBe("studio");
    expect(siteNavigationContextForPath("/brush-lab")).toBe("studio");
    expect(siteNavigationContextForPath("/discover")).toBe("spectrum");
    expect(siteNavigationContextForPath("/community")).toBe("spectrum");
    expect(siteNavigationContextForPath("/fortune")).toBe("spectrum");

    expect(primarySiteNavigationForPath("/")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/studio")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/help")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/about/technology")).toBe(TOONSTUDIO_PRIMARY_NAVIGATION);
    expect(primarySiteNavigationForPath("/discover")).toBe(TOONSPECTRUM_PRIMARY_NAVIGATION);
    expect(siteNavigationGroupsForPath("/")).toBe(TOONSTUDIO_NAVIGATION_GROUPS);
    expect(siteNavigationGroupsForPath("/studio")).toBe(TOONSTUDIO_NAVIGATION_GROUPS);
    expect(siteNavigationGroupsForPath("/about/technology")).toBe(TOONSTUDIO_NAVIGATION_GROUPS);
    expect(siteNavigationGroupsForPath("/discover")).toBe(TOONSPECTRUM_NAVIGATION_GROUPS);
    expect(mobileSiteTabsForPath("/")).toBe(TOONSTUDIO_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/studio")).toBe(TOONSTUDIO_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/help")).toBe(TOONSTUDIO_MOBILE_TABS);
    expect(mobileSiteTabsForPath("/discover")).toBe(TOONSPECTRUM_MOBILE_TABS);
  });

  it("uses four Studio destinations and preserves reader navigation", () => {
    expect(TOONSTUDIO_MOBILE_TABS.map((item) => item.id)).toEqual([
      "workspace-home",
      "studio",
      "workspace-team",
      "workspace-hub",
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
      expect(item.href).toMatch(/^\//u);
      expect(siteNavigationText(item.label, "ko-KR").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.label, "en-US").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "ko").length).toBeGreaterThan(0);
      expect(siteNavigationText(item.description, "en").length).toBeGreaterThan(0);
    }
    expect(siteNavigationLocale("KO_kr")).toBe("ko");
    expect(siteNavigationLocale("ja-JP")).toBe("en");
  });
});
