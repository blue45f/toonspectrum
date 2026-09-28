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
  it("홈은 중복 바로가기 줄을 렌더하지 않고 기존 주요 목적지를 유지한다", () => {
    const { container } = render(<HeaderWithAppearance />);
    const header = screen.getByRole("banner");
    const navigation = within(header).getByRole("navigation", { name: "주요 메뉴" });

    expect(header.getAttribute("data-site-home")).toBe("true");
    expect(container.querySelector(".public-site-journey")).toBeNull();
    expect(within(header).queryByRole("navigation", { name: "제작 기능 바로가기" })).toBeNull();
    expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual(["/", "/studio", "/discover", "/community", "/sitemap"]);
    expect(within(navigation).getByRole("link", { name: "홈" }).getAttribute("aria-current"))
      .toBe("page");
    expect(within(header).getByRole("link", { name: "새 작품" }).getAttribute("href"))
      .toBe("/studio/new");
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
    expect(within(navigation).getByRole("link", { name: "Home" }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("button", { name: "Calm appearance" })).toBeTruthy();
    expect(within(navigation).getByRole("link", { name: "All" }).getAttribute("href"))
      .toBe("/sitemap");
  });
});
