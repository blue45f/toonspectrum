// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./site-header";
import { SiteExperienceContext } from "./site-experience/site-experience-context";
import type { ExperienceMode } from "./site-experience/site-experience-model";

import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";

vi.mock("../../domains/auth/components/auth-menu-shell", () => ({
  AuthMenuShell: () => <button type="button">계정</button>,
}));

vi.mock("@/domains/engagement/EngagementHeaderNotifications", () => ({
  EngagementHeaderNotifications: () => <button type="button">알림</button>,
}));

function HeaderWithAppearance({ pathname = "/" }: { pathname?: string }) {
  const [mode, setMode] = useState<ExperienceMode>("vivid");
  return (
    <MemoryRouter initialEntries={[pathname]}>
      <SiteExperienceContext.Provider value={{ mode, setMode }}>
        <SiteHeader />
      </SiteExperienceContext.Provider>
    </MemoryRouter>
  );
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
  useUi.getState().closeCommandPalette();
  vi.unstubAllGlobals();
});

describe("단일 창작 헤더", () => {
  it("홈은 중복 바로가기 줄을 렌더하지 않고 주요 목적지를 새 구조로 유지한다", () => {
    const { container } = render(<HeaderWithAppearance />);
    const header = screen.getByRole("banner");
    const navigation = within(header).getByRole("navigation", { name: "주요 메뉴" });

    expect(header.getAttribute("data-site-home")).toBe("true");
    expect(container.querySelector(".public-site-journey")).toBeNull();
    expect(within(header).queryByRole("navigation", { name: "제작 기능 바로가기" })).toBeNull();
    expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual([
        "/studio", "/studio", "/studio/new", "/studio/comic", "/studio/assets/characters/new", "/studio/bg3d",
        "/studio/space",
        "/production", "/production", "/team/people", "/collaborate",
        "/discover", "/explore", "/ranking", "/calendar",
        "/community",
        "/learn", "/learn/classroom", "/guide",
        "/market",
      ]);
    // 헤더의 제작/전체 진입은 레거시 별칭(/new, /more)이 아닌 canonical 경로로 직접 연결한다.
    expect(within(navigation).getByRole("link", { name: "제작" }).getAttribute("href")).toBe("/studio");
    expect(within(navigation).getByRole("link", { name: "가상 스튜디오" }).getAttribute("href")).toBe("/studio/space");
    expect(within(navigation).getByRole("link", { name: "협업" }).getAttribute("href")).toBe("/production");
    // 가벼운 즐길 거리(운세)는 주 메뉴가 아니라 전체 메뉴·푸터에서 찾는다.
    expect(within(navigation).queryByRole("link", { name: "운세" })).toBeNull();
    expect(within(header).getByRole("link", { name: "새 작품" }).getAttribute("href"))
      .toBe("/studio/new");
  });

  it("탐색과 배우기 드롭다운은 필요한 곳에만 두고 canonical 목적지로 연결한다", () => {
    render(<HeaderWithAppearance />);
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });

    const explore = within(navigation).getByRole("link", { name: "탐색" });
    expect(explore.getAttribute("aria-haspopup")).toBe("true");
    const exploreMenu = explore.parentElement?.querySelector("ul");
    expect(exploreMenu?.getAttribute("aria-label")).toBe("탐색");
    expect(Array.from(exploreMenu?.querySelectorAll("a") ?? []).map((link) => link.getAttribute("href")))
      .toEqual(["/explore", "/ranking", "/calendar"]);

    const learn = within(navigation).getByRole("link", { name: "배우기" });
    expect(learn.getAttribute("aria-haspopup")).toBe("true");
    const learnMenu = learn.parentElement?.querySelector("ul");
    expect(Array.from(learnMenu?.querySelectorAll("a") ?? []).map((link) => link.getAttribute("href")))
      .toEqual(["/learn/classroom", "/guide"]);

    expect(within(navigation).getByRole("link", { name: "커뮤니티" }).getAttribute("aria-haspopup")).toBeNull();
    expect(within(navigation).getByRole("link", { name: "마켓" }).getAttribute("href")).toBe("/market");
  });

  it("홈에서 화면 분위기 전환의 상태와 왕복 조작을 유지한다", () => {
    render(<HeaderWithAppearance />);
    const toggle = screen.getByRole("button", { name: "차분한 화면" });

    expect(toggle.classList.contains("site-header__appearance")).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("공개 하위 페이지에는 현재 단계 탐색과 기존 화면 전환을 유지한다", () => {
    const { container } = render(<HeaderWithAppearance pathname="/market/resource/brush" />);
    const navigation = screen.getByRole("navigation", { name: "창작 단계별 바로가기" });
    const active = within(navigation).getByRole("link", { name: "재료 고르기" });

    expect(active.getAttribute("aria-current")).toBe("step");
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "차분한 화면" })).toHaveLength(1);
    expect(container.querySelector(".site-header__appearance")).toBeNull();
  });

  it.each([
    ["/studio/space", "가상 스튜디오", ["제작", "협업"]],
    ["/studio/p/project-1/space", "가상 스튜디오", ["제작", "협업"]],
    ["/production/projects/demo/overview", "협업", ["제작", "커뮤니티"]],
    ["/collaborate", "협업", ["커뮤니티", "제작"]],
    ["/studio/assets/characters/new", "제작", ["가상 스튜디오", "협업"]],
    ["/market", "마켓", ["탐색"]],
    ["/learn/classroom", "배우기", ["탐색"]],
    ["/ranking", "탐색", ["마켓", "배우기"]],
  ])("%s에서는 %s만 현재 창작 축으로 표시한다", (pathname, current, others) => {
    render(<HeaderWithAppearance pathname={pathname} />);
    const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(navigation).getByRole("link", { name: current }).getAttribute("aria-current")).toMatch(/^(page|true)$/u);
    for (const name of others) {
      expect(within(navigation).getByRole("link", { name }).getAttribute("aria-current")).toBeNull();
    }
  });

  it("검색 실행과 계정 진입을 단일 헤더에서 유지한다", () => {
    const { container } = render(<HeaderWithAppearance />);
    const search = container.querySelector<HTMLButtonElement>(".site-header__search");
    if (!search) throw new Error("상단 검색 버튼이 없습니다.");

    expect(search.getAttribute("aria-label")).toBeTruthy();
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    fireEvent.click(search);
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    expect(screen.getByRole("button", { name: "계정" })).toBeTruthy();
  });

  it("영문에서도 현재 목적지와 화면 설정 이름을 유지한다", () => {
    useI18n.getState().setLang("en");
    render(<HeaderWithAppearance />);

    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getByRole("link", { name: "Studio" }).getAttribute("href"))
      .toBe("/studio");
    expect(within(navigation).getByRole("link", { name: "Virtual studio" }).getAttribute("href"))
      .toBe("/studio/space");
    expect(within(navigation).getByRole("link", { name: "Collaborate" }).getAttribute("href"))
      .toBe("/production");
    expect(within(navigation).getByRole("link", { name: "Learn" }).getAttribute("aria-haspopup"))
      .toBe("true");
    expect(screen.getByRole("button", { name: "Calm appearance" })).toBeTruthy();
  });
});
