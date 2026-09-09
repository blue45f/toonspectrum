import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ROOT_HOME = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const MAKE_HUB = "apps/web/src/domains/creator-resources/MakeHubPage.tsx";
const CREATOR_ROUTES = "apps/web/src/app/routes/groups/creator-resources.routes.tsx";
const LEGAL_ROUTES = "apps/web/src/app/routes/groups/legal.routes.tsx";
const MARKET_NAV = "apps/web/src/domains/market/components/MarketNavHeader.tsx";
const RANDOM_PAGE = "apps/web/src/domains/catalog/RandomPage.tsx";

describe("purpose-first product UX foundation", () => {
  it("puts the goal launcher before the deeper creator homepage", () => {
    const source = readFileSync(ROOT_HOME, "utf8");
    expect(source).toContain("<ProductIntentStart />");
    expect(source.indexOf("<ProductIntentStart />")).toBeLessThan(source.indexOf("<CreatorHomeExperience />"));
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
