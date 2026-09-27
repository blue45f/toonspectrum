// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { PALETTE_PAGES, palettePagesForLocale } from "./command-palette-data";
import { matchesCommandSearch } from "./command-palette-search";
import { SITE_NAVIGATION_ITEMS } from "./site-navigation";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

vi.mock("@toonstudio/core/fx", () => ({
  getAudioState: vi.fn(),
  setBgmEnabled: vi.fn(),
  setSfxEnabled: vi.fn(),
}));

describe("메뉴와 명령 팔레트의 목적지 일치", () => {
  it("전역 메뉴의 모든 목적지를 같은 명칭·주소로 검색한다", () => {
    for (const item of Object.values(SITE_NAVIGATION_ITEMS)) {
      const pages = PALETTE_PAGES.filter((page) => page.href === item.href);
      expect(pages, item.href).toHaveLength(1);
      const page = pages[0];
      expect(page.title).toBe(item.label.ko);
      expect(page.subtitle).toBe(item.description.ko);
      expect(matchesCommandSearch(page.title, item.label.en, page.keywords, page.subtitle)).toBe(true);
    }
  });

  it("영어 페이지명·설명을 표시하면서 한국어 검색과 목적지를 유지한다", () => {
    const englishPages = palettePagesForLocale("en-US");
    expect(englishPages.map((page) => page.href)).toEqual(PALETTE_PAGES.map((page) => page.href));
    for (const page of englishPages) {
      expect(page.title).not.toMatch(/[가-힣]/u);
      expect(page.subtitle).not.toMatch(/[가-힣]/u);
    }
    const learningPage = englishPages.find((page) => page.href === "/learn");
    expect(learningPage?.title).toBe(SITE_NAVIGATION_ITEMS.learn.label.en);
    expect(learningPage && matchesCommandSearch(learningPage.title, "배우기", learningPage.keywords, learningPage.subtitle)).toBe(true);
    expect(palettePagesForLocale("ko-KR")).toBe(PALETTE_PAGES);
  });

  it("별칭을 재노출하지 않고 기존 결과의 단축키·검색어를 유지한다", () => {
    expect(new Set(PALETTE_PAGES.map((page) => page.href)).size).toBe(PALETTE_PAGES.length);
    expect(new Set(PALETTE_PAGES.map((page) => page.id)).size).toBe(PALETTE_PAGES.length);
    for (const page of PALETTE_PAGES) expect(canonicalSitePath(page.href)).toBe(page.href);
    expect(PALETTE_PAGES.find((page) => page.id === "page-studio")?.shortcut).toEqual(["G", "S"]);
  });

  it.each([
    ["내 프로젝트", "/studio"], ["배우기", "/learn"], ["리서치", "/research"],
    ["제작 관리", "/production"], ["검수", "/studio/publish"], ["갤러리", "/showcase"],
    ["팀", "/team"], ["전체 기능", "/sitemap"], ["만들기", "/studio/new"],
    ["shaper", "/studio/assets/characters/new"], ["New work", "/studio/new"],
  ])("%s 검색으로 %s 작업에 도달한다", (query, href) => {
    const results = PALETTE_PAGES.filter((page) => matchesCommandSearch(page.title, query, page.keywords, page.subtitle));
    expect(results.map((page) => page.href)).toContain(href);
  });
});
