import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ROOT_HOME = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const HOME_EXPERIENCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
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
  it("puts the task launcher before detailed creator guidance", () => {
    const root = readFileSync(ROOT_HOME, "utf8");
    const experience = readFileSync(HOME_EXPERIENCE, "utf8");
    expect(root).toContain("<StudioWorkspacePage />");
    expect(root).not.toContain("<CreatorHomeExperience");
    const routes = readFileSync("apps/web/src/app/routes/groups/marketing.routes.tsx", "utf8");
    expect(routes).toContain('path: "/about/studio"');
    expect(experience).toContain("<ProductIntentStart />");
    expect(experience.indexOf("<ProductIntentStart />")).toBeLessThan(
      experience.indexOf('id="creator-start"'),
    );
  });

  it("opens the true global command palette from the home search launcher", () => {
    const source = readFileSync(PRODUCT_INTENT, "utf8");
    expect(source).toContain("state.openCommandPalette");
    expect(source).toContain("onClick={openSearch}");
    expect(source).toContain('search: "프로젝트·컷·도구·소재를 바로 찾기"');
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
    expect(navigation).toMatch(/explore:\s*item\(\s*"explore",\s*"\/discover"/u);
  });

  it("routes My Space as the global account destination while preserving detailed account pages", () => {
    const routes = readFileSync(ACCOUNT_ROUTES, "utf8");
    const navigation = readFileSync(SITE_NAVIGATION, "utf8");
    expect(routes).toMatch(/route\(\s*"account-my-space"\s*,\s*"\/my"/u);
    expect(routes).toMatch(/route\(\s*"account-me"\s*,\s*"\/me"/u);
    expect(navigation).toMatch(/me:\s*item\(\s*"me",\s*"\/my"/u);
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
    expect(source).toContain("배포하기");
    expect(source).toContain("웹툰 소재 작업실");
    expect(source).not.toContain("판매자 센터");
  });

  it("previews random picks instead of forcing a detail redirect", () => {
    const source = readFileSync(RANDOM_PAGE, "utf8");
    expect(source).toContain("다시 뽑기");
    expect(source).toContain("이 작품 보기");
    expect(source).not.toContain("router.replace");
  });
});
