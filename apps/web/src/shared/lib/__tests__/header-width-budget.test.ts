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
    const primaryNavigation = header.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(primaryNavigation).toContain("min-[1180px]:flex");
    expect(primaryNavigation).toContain(
      "rounded-xl px-3 py-2 text-[0.82rem] font-semibold",
    );
    expect(primaryNavigation).not.toContain("xl:grid");
    expect(primaryNavigation).toContain("<Icon");
    expect(primaryNavigation).toContain("size={15}");
    expect(primaryNavigation).toContain('aria-current={active ? "page" : undefined}');
    expect(primaryNavigation).toContain('data-navigation-entry={item.id}');
    expect(primaryNavigation).toContain('strokeWidth={active ? 2.35 : 1.9}');
    expect(primaryNavigation).not.toContain('data-navigation-entry="technology"');
  });

  it("narrows the search trigger before restoring its roomy xl width", () => {
    const header = read("apps/web/src/shared/components/site-header.tsx");

    expect(header).toContain(
      "sm:w-48 sm:justify-between sm:px-3 lg:w-40 xl:w-52",
    );
    expect(header).toContain("hidden truncate text-sm sm:inline");
    // ⌘K 배지는 폭이 빠듯한 lg 구간에서만 양보하고 xl부터 복귀한다.
    expect(header).toContain("sm:flex lg:hidden xl:flex");
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
