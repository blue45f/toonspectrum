import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mobileSiteTabsForPath } from "./site-navigation";

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
    // 마켓 화면이 한·영 문구로 옮겨 가도 라이선스 필터는 이름 붙은 조작부로 남는다.
    expect(marketBrowse).toContain('aria-label={t("라이선스 필터", "License filter")}');
  });

  it("reserves safe mobile space for global overlays and the five-part journey", () => {
    const floating = source("./FloatingControls.tsx");
    const beta = source("../../domains/creator/StudioBetaNoticeGate.tsx");
    const shell = source("./public-site-shell.css");
    const mobileNavigation = source("./site-header-mobile-nav.tsx");
    const scene = source("./route-purpose-scene.css");
    const workspace = source("./workspace/workspace-visual-v3.css");

    // 휴대폰 ⚙ 묶음은 고정 9rem 대신 실제 하단 탭 높이에서 계산한 기준선 위에 놓인다.
    expect(floating).toContain("max-md:bottom-[var(--site-float-base)]");
    expect(floating).not.toContain("calc(9rem+env(safe-area-inset-bottom))");
    expect(beta).toContain("bottom-[calc(5.75rem+env(safe-area-inset-bottom))]");
    expect(beta).toContain('data-studio-beta-notice-mode="compact"');
    // 헤더 아래 두 번째 탐색 줄은 주 메뉴와 선택 표시가 겹쳐 제거했다(모바일은 하단 탭이 같은 역할).
    expect(shell).not.toContain(".public-site-journey");
    expect(mobileSiteTabsForPath("/explore")).toHaveLength(5);
    expect(mobileNavigation).toContain('mobileTabs.length === 5 ? "grid-cols-5" : "grid-cols-4"');
    expect(scene).toContain("min-height: 8rem");
    expect(scene).toContain(".route-purpose-scene__cards,");
    expect(workspace).toContain("grid-template-columns:repeat(5,minmax(0,1fr))");
    expect(workspace).toContain('data-navigation-entry="all-menu"');
  });

  /**
   * 리서치 데스크의 섹션 이동은 예전의 '이동할 섹션 선택' 셀렉트 + 데스크톱 전용 가로 줄에서
   * 탭(SiteSectionTabs)으로 바뀌었다. 계약의 의도(휴대폰에서 화면 밖으로 밀려난 조작부가 없고,
   * 모든 섹션이 이름 붙은 조작부로 닿는다)는 그대로여서 새 구조에 맞춰 검증한다.
   */
  it("keeps every research desk section reachable on a phone without hidden offscreen controls", () => {
    const research = source("../../domains/creator-resources/CreatorHubPage.tsx");
    const tabs = source("../../domains/legal/public/site-section-tabs.tsx");

    expect(research).toContain("<SiteSectionTabs");
    expect(research).toContain('label={bt("리서치 데스크 작업 영역", "Research desk workspace")}');
    expect(tabs).toContain('role="tablist"');

    // 탭이 MAX_SEGMENTED_TABS 이하면 한 줄 분할 버튼이라 전부 보인다. 더 많아지면 스냅 레일이어야 한다.
    const segmentedLimit = Number(/const MAX_SEGMENTED_TABS = (\d+);/u.exec(tabs)?.[1]);
    const deskTabs = /const DESK_TABS[^=]*=\s*\[([^\]]*)\]/u.exec(research)?.[1] ?? "";
    const deskTabCount = deskTabs.split(",").filter((id) => id.trim()).length;
    expect(segmentedLimit).toBeGreaterThanOrEqual(3);
    expect(deskTabCount).toBeGreaterThanOrEqual(2);
    if (deskTabCount > segmentedLimit) {
      expect(tabs).toContain("snap-x");
      expect(tabs).toContain("overflow-x-auto");
    } else {
      // 분할 줄에는 탭 수와 같은 열 클래스가 있어야 한 줄에 나란히 놓인다.
      expect(tabs).toContain(`${deskTabCount}: "grid-cols-${deskTabCount}"`);
    }
  });
});
