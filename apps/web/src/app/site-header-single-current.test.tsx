// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SITEMAP_DIRECTORY_ENTRIES } from "@/domains/legal/site-directory-data";
import { SiteHeader } from "@/shared/components/site-header";
import { SiteExperienceContext } from "@/shared/components/site-experience/site-experience-context";
import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

vi.mock("@/domains/auth/components/auth-menu-shell", () => ({
  AuthMenuShell: () => <button type="button">계정</button>,
}));

vi.mock("@/domains/engagement/EngagementHeaderNotifications", () => ({
  EngagementHeaderNotifications: () => <button type="button">알림</button>,
}));

/** 사이트 지도에 없는 깊은 경로: 작품·팀·회차처럼 매개변수가 붙는 화면. */
const DEEP_ROUTES = [
  "/studio/p/project-1",
  "/studio/p/project-1/space",
  "/studio/space/rooms/cafe",
  "/studio/new/template",
  "/studio/import",
  "/studio/comic/episode-1",
  "/studio/bg3d/scene-1",
  "/studio/assets/characters/new",
  "/studio/publish/episode-1",
  "/studio/templates",
  "/studio/manual",
  "/make",
  "/production/projects/demo/overview",
  "/production/projects/demo/episodes/3",
  "/team/people",
  "/collaborate/post-1",
  "/community/post/12",
  "/community/cafes/cafe-1",
  "/title/title-1",
  "/u/creator-1",
  "/author/author-1",
  "/market/resource/brush",
  "/market/browse",
  "/learn/classroom",
  "/learn/lessons/first-panel",
  "/guide",
  "/help",
  "/research",
  "/about/technology",
  "/about/technology/deck",
];

const ROUTES = [...new Set([
  ...SITEMAP_DIRECTORY_ENTRIES.map((entry) => entry.href),
  ...DEEP_ROUTES,
])].sort();

function renderHeader(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SiteExperienceContext.Provider value={{ mode: "vivid", setMode: () => {} }}>
        <SiteHeader />
      </SiteExperienceContext.Provider>
    </MemoryRouter>,
  );
}

/** 주 메뉴 최상위 항목 중 현재 위치로 표시된 것. */
function currentPrimaryEntries(): string[] {
  const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  return Array.from(navigation.querySelectorAll<HTMLAnchorElement>(".site-header__primary-link"))
    .filter((link) => link.hasAttribute("aria-current"))
    .map((link) => link.dataset.navigationEntry ?? link.textContent ?? "");
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query === "(min-width: 1180px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  useI18n.getState().setLang("ko");
  useUi.getState().closeCommandPalette();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("헤더 현재 위치는 한 곳만 표시한다", () => {
  it.each(ROUTES)("%s: 주 메뉴 현재 위치는 최대 하나", (pathname) => {
    renderHeader(pathname);
    expect(currentPrimaryEntries().length, `${pathname}: ${currentPrimaryEntries().join(", ")}`).toBeLessThanOrEqual(1);
  });

  it.each(ROUTES)("%s: 헤더 전체에서 선택 표시 줄은 하나뿐", (pathname) => {
    const { container } = renderHeader(pathname);
    const header = screen.getByRole("banner");
    // 새 작품 버튼은 이동 동작이라 현재 위치 표시를 갖지 않는다.
    const create = header.querySelector(".site-header__create");
    expect(create?.hasAttribute("aria-current") ?? false).toBe(false);
    // 주 메뉴 아래 두 번째 탐색 줄(단계 바로가기)이 또 다른 선택 표시를 만들지 않는다.
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(0);
  });

  it.each(ROUTES)("%s: 드롭다운 하위 현재 위치는 부모 항목과 함께만 나타난다", (pathname) => {
    renderHeader(pathname);
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    for (const menu of Array.from(navigation.querySelectorAll("ul"))) {
      const currentChildren = menu.querySelectorAll('a[aria-current="page"]');
      expect(currentChildren.length).toBeLessThanOrEqual(1);
      if (currentChildren.length === 0) continue;
      const parent = menu.closest(".group")?.querySelector(".site-header__primary-link");
      expect(parent?.hasAttribute("aria-current")).toBe(true);
    }
  });

  it.each([
    ["/studio", "studio"],
    ["/studio/new", "studio"],
    ["/studio/p/project-1", "studio"],
    ["/studio/space", "virtual-studio"],
    ["/studio/p/project-1/space", "virtual-studio"],
    ["/production/projects/demo/overview", "collaborate"],
    ["/team/people", "collaborate"],
    ["/collaborate", "collaborate"],
    ["/ranking", "explore"],
    ["/research/fonts", "learn"],
    ["/studio/manual", "learn"],
    ["/studio/space/rooms/cafe", "virtual-studio"],
    ["/community/post/12", "community"],
    ["/learn/classroom", "learn"],
    ["/market/resource/brush", "market"],
  ])("%s는 %s 한 곳만 현재 위치다", (pathname, entry) => {
    renderHeader(pathname);
    expect(currentPrimaryEntries()).toEqual([entry]);
  });
});
