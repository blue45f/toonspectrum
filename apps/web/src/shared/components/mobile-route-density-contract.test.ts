import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("mobile route density contract", () => {
  it("replaces long mobile filter rails with compact controls", () => {
    const ranking = source("./ranking-board.tsx");
    const discovery = source("./discovery-workspace-nav.tsx");
    const news = source("../../domains/catalog/NewsPage.tsx");
    const cafes = source("../../domains/community/CafesPage.tsx");

    expect(ranking).toContain('aria-label="랭킹 산식 축"');
    expect(ranking).toContain('className="hidden gap-2 sm:grid');
    expect(discovery).not.toContain('min-w-[42rem]');
    expect(discovery).toContain('grid grid-cols-3');
    expect(news).toContain("소식 카테고리");
    expect(cafes).toContain("커뮤니티 유형");
    expect(cafes).toContain("관심 장르");
  });

  it("keeps research and market destinations reachable without offscreen controls", () => {
    const resources = source("../../domains/creator-resources/ResourceLayout.tsx");
    const marketHeader = source("../../domains/market/components/MarketNavHeader.tsx");
    const marketBrowse = source("../../domains/market/pages/MarketBrowsePage.tsx");

    expect(resources).toContain('className="resource-menu-mobile"');
    expect(resources).toContain("리서치·학습 전체 메뉴");
    expect(marketHeader).toContain("조건 맞춤");
    expect(marketHeader).toContain("후보 비교");
    expect(marketBrowse).toContain('aria-label="라이선스 필터"');
  });

  it("reserves safe mobile space for global overlays and the five-part journey", () => {
    const floating = source("./FloatingControls.tsx");
    const beta = source("../../domains/creator/StudioBetaNoticeGate.tsx");
    const shell = source("./public-site-shell.css");
    const scene = source("./route-purpose-scene.css");

    expect(floating).toContain("calc(9rem+env(safe-area-inset-bottom))");
    expect(beta).toContain("bottom-[calc(9rem+env(safe-area-inset-bottom))]");
    expect(shell).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(scene).toContain("min-height: 8rem");
    expect(scene).toContain(".route-purpose-scene__cards,");
  });
});
