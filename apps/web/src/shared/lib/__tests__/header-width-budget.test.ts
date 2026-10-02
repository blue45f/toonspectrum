import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// 헤더 폭 예산 — 제품 문맥별 핵심 목적지와 전체 메뉴, 검색, 생성·계정 동작을 한 줄에 유지한다.
// 현재 헤더는 9개 고정 링크 대신 문맥별 핵심 목적지만 1180px부터 노출하므로, 작은
// 목적 아이콘과 텍스트 내비, 검색 트리거의 단계별 폭을 계약으로 고정한다.
describe("header width budget", () => {
  it("keeps the purpose navigation compact and gated to the measured desktop width", () => {
    const header = read("apps/web/src/shared/components/site-header.tsx");
    const start = header.indexOf('aria-label={bi("주요 메뉴", "Primary navigation")}');
    const end = header.indexOf("</nav>", start);
    const navigationBlock = header.slice(start, end);
    // 항목 하나의 마크업(아이콘·강조·aria-current)은 HeaderPrimaryNavigationEntry가 그린다. 구역이 하나로 정해지므로 강조 기준은 highlighted다.
    const entryStart = header.indexOf("function HeaderPrimaryNavigationEntry(");
    const entryEnd = header.indexOf("\n}\n", entryStart);
    const entryBlock = header.slice(entryStart, entryEnd);
    const primaryNavigation = `${navigationBlock}\n${entryBlock}`;

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(entryStart).toBeGreaterThan(-1);
    expect(entryEnd).toBeGreaterThan(entryStart);
    expect(navigationBlock).toContain("<HeaderPrimaryNavigationEntry");
    const css = read("apps/web/src/shared/components/public-site-shell.css");
    expect(primaryNavigation).toContain('className="site-header__primary"');
    expect(primaryNavigation).toContain('className="site-header__primary-link group"');
    expect(css).toMatch(/\.site-header__primary\s*\{[^}]*display:\s*none/u);
    expect(css).toMatch(/@media\s*\(width\s*>=\s*1180px\)\s*\{\s*\.site-header__primary\s*\{\s*display:\s*flex/u);
    const linkRule = css.match(/\.site-header__primary-link\s*\{([^}]*)\}/u)?.[1] ?? "";
    expect(linkRule).toContain("min-height: 44px");
    expect(linkRule).toContain("flex-shrink: 0");
    expect(linkRule).toContain("white-space: nowrap");
    expect(linkRule).toContain("padding: 8px 9px");
    expect(primaryNavigation).not.toContain("xl:grid");
    expect(primaryNavigation).toContain("<Icon");
    expect(primaryNavigation).toContain("size={15}");
    expect(primaryNavigation).toContain('aria-current={highlighted ? (isActive(item.href, true) ? "page" : "true") : undefined}');
    expect(primaryNavigation).toContain('data-navigation-entry={item.id}');
    expect(primaryNavigation).toContain('strokeWidth={highlighted ? 2.35 : 1.9}');
    expect(primaryNavigation).not.toContain('data-navigation-entry="technology"');
  });

  it("keeps the search trigger compact and expands it from sm widths", () => {
    const header = read("apps/web/src/shared/components/site-header.tsx");
    const css = read("apps/web/src/shared/components/public-site-shell.css");

    expect(header).toContain("site-header__search");
    expect(header).toContain("sm:justify-between sm:px-3");
    expect(css).toContain(".site-header__search { width: 44px; padding-inline: 0; }");
    expect(header).toContain("site-header__search-label truncate text-sm");
    // ⌘K 배지는 기본 숨김 상태를 유지하고 sm 이상에서 버튼 확장과 함께 노출된다.
    expect(header).toContain("site-header__search-shortcut");
  });

  it("keeps EN nav labels within the measured width budget", () => {
    const en = JSON.parse(read("apps/web/public/i18n/app/nav/en.json")) as Record<string, string>;
    const labels = [
      "home",
      "ranking",
      "calendar",
      "recommend",
      "explore",
      "reviews",
      "community",
      "insights",
      "create",
    ].map((key) => en[`nav.${key}`]);

    expect(labels.filter((label) => typeof label === "string")).toHaveLength(9);
    for (const label of labels) {
      expect(label.length, label).toBeLessThanOrEqual(9);
    }
    expect(labels.join("").length).toBeLessThanOrEqual(56);
  });
});
