import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ROOT_HOME = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const PRODUCT_INTENT = "apps/web/src/domains/creator-resources/ProductIntentStart.tsx";
const MAKE_HUB = "apps/web/src/domains/creator-resources/MakeHubPage.tsx";
const CREATOR_ROUTES = "apps/web/src/app/routes/groups/creator-resources.routes.tsx";
const CATALOG_ROUTES = "apps/web/src/app/routes/groups/catalog.routes.tsx";
const ACCOUNT_ROUTES = "apps/web/src/app/routes/groups/account.routes.tsx";
const SITE_NAVIGATION = "apps/web/src/shared/components/site-navigation.ts";
const SITE_HEADER = "apps/web/src/shared/components/site-header.tsx";
const MOBILE_NAV = "apps/web/src/shared/components/site-header-mobile-nav.tsx";
const COMMAND_PALETTE = "apps/web/src/shared/components/command-palette-data.ts";
const LEGAL_ROUTES = "apps/web/src/app/routes/groups/legal.routes.tsx";
const MARKET_NAV = "apps/web/src/domains/market/components/MarketNavHeader.tsx";
const RANDOM_PAGE = "apps/web/src/domains/catalog/RandomPage.tsx";

describe("purpose-first product UX foundation", () => {
  it("puts the goal launcher before the deeper creator homepage", () => {
    const source = readFileSync(ROOT_HOME, "utf8");
    expect(source).toContain("<ProductIntentStart />");
    expect(source.indexOf("<ProductIntentStart />")).toBeLessThan(source.indexOf("<CreatorHomeExperience />"));
  });

  it("opens the true global command palette from the home search launcher", () => {
    const source = readFileSync(PRODUCT_INTENT, "utf8");
    expect(source).toContain("state.openCommandPalette");
    expect(source).toContain("onClick={openSearch}");
    expect(source).toContain("작품·도구·에셋·도움말 검색");
    expect(source).not.toContain('href="/search"\n              className="mt-6');
  });

  it("routes the unified Create hub without replacing direct Studio routes", () => {
    const hub = readFileSync(MAKE_HUB, "utf8");
    const routes = readFileSync(CREATOR_ROUTES, "utf8");
    expect(routes).toContain('path: "/make"');
    expect(hub).toContain('href="/studio/projects"');
    expect(hub).toContain('/studio?preset=webtoon');
    expect(hub).toContain('/studio?preset=4cut');
    expect(hub).toContain('/studio?preset=illustration');
  });

  it("routes Discover as the global find destination while preserving specialist discovery pages", () => {
    const routes = readFileSync(CATALOG_ROUTES, "utf8");
    const navigation = readFileSync(SITE_NAVIGATION, "utf8");
    expect(routes).toContain('path: "/discover"');
    for (const path of ["/search", "/explore", "/ranking", "/recommend", "/calendar", "/random", "/compare"]) {
      expect(routes).toContain(`path: "${path}"`);
    }
    expect(navigation).toContain('item("explore", "/discover"');
  });

  it("routes My Space as the global account destination while preserving detailed account pages", () => {
    const routes = readFileSync(ACCOUNT_ROUTES, "utf8");
    const navigation = readFileSync(SITE_NAVIGATION, "utf8");
    expect(routes).toContain('path: "/my"');
    expect(routes).toContain('path: "/me"');
    expect(navigation).toContain('item("me", "/my"');
  });

  it("keeps purpose-level active state separate from exact drawer destinations", () => {
    const header = readFileSync(SITE_HEADER, "utf8");
    const mobile = readFileSync(MOBILE_NAV, "utf8");
    expect(header).toContain("function purposeActive(");
    expect(header).toContain("function useDestinationActive()");
    expect(header).toContain("isPurposeActive={isPurposeActive}");
    expect(mobile).toContain("isPurposeActive: (href: string, exact?: boolean) => boolean;");
    expect(mobile).toContain("const active = isPurposeActive(item.href, item.exact);");
  });

  it("indexes the new purpose hubs in the global command palette", () => {
    const palette = readFileSync(COMMAND_PALETTE, "utf8");
    for (const href of ["/discover", "/make", "/my", "/help"]) {
      expect(palette).toContain(`href: "${href}"`);
    }
  });

  it("exposes searchable help and accessibility destinations", () => {
    const routes = readFileSync(LEGAL_ROUTES, "utf8");
    expect(routes).toContain('path: "/help"');
    expect(routes).toContain('path: "/accessibility"');
  });

  it("uses distribution language for the free-first marketplace", () => {
    const source = readFileSync(MARKET_NAV, "utf8");
    expect(source).toContain("배포 관리");
    expect(source).toContain("에셋 배포");
    expect(source).not.toContain("판매자 센터");
  });

  it("previews random picks instead of forcing a detail redirect", () => {
    const source = readFileSync(RANDOM_PAGE, "utf8");
    expect(source).toContain("다시 뽑기");
    expect(source).toContain("이 작품 보기");
    expect(source).not.toContain("router.replace");
  });
});
