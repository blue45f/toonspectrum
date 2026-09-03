// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCompanionAssistantDisplay } from "./StudioCompanionAssistantDisplay";

afterEach(cleanup);

const TAB_PREFIX = "companion-assistant";

function openTab(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

function openSfxTab() {
  render(<StudioCompanionAssistantDisplay />);
  openTab("효과음 사전");
}

describe("StudioCompanionAssistantDisplay", () => {
  it("renders companion assistant toolkit surface with all 6 quick tabs", () => {
    const markup = renderToStaticMarkup(<StudioCompanionAssistantDisplay />);

    expect(markup).toContain("웹툰 보조 툴킷");
    expect(markup).toContain("플랫폼 규격");
    expect(markup).toContain("스크롤 페이싱");
    expect(markup).toContain("효과음 사전");
    expect(markup).toContain("컬러 조화");
    expect(markup).toContain("포커스 타이머");
    expect(markup).toContain("크로키 가이드");
    expect(markup).toContain("네이버웹툰 (도전/베도/정식)");
  });
});

describe("StudioCompanionAssistantDisplay — 디자인 토큰", () => {
  it("creator UI 에서 테마 전환되지 않는 원시 팔레트 색을 쓰지 않는다", () => {
    // 감사 콜아웃(emerald/amber/rose)·완독 수치(emerald)·복사 체크(emerald) 회귀 방지.
    const markup = renderToStaticMarkup(<StudioCompanionAssistantDisplay />);
    expect(markup).not.toMatch(/\b(?:text|bg|border)-(?:emerald|amber|rose|slate|zinc|gray)-\d/);
    expect(markup).not.toContain("dark:text-");
  });

  it("규격 감사 콜아웃을 good/warn/bad 시맨틱 토큰으로 칠한다", () => {
    const { container } = render(<StudioCompanionAssistantDisplay />);
    expect(container.innerHTML).toMatch(/border-(?:good|warn|bad)\/35/);
    expect(container.innerHTML).toMatch(/bg-(?:good|warn|bad)\/10/);
  });
});

describe("StudioCompanionAssistantDisplay — 탭 시맨틱", () => {
  it("6개 탭을 이름 붙은 tablist 로 노출하고 활성 탭만 selected 로 표시한다", () => {
    render(<StudioCompanionAssistantDisplay />);

    const list = screen.getByRole("tablist", { name: "웹툰 보조 툴킷 탭" });
    expect(list).toBeTruthy();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("각 탭이 좁은 창에서 잘려도 전체 이름이 남도록 title 을 단다", () => {
    render(<StudioCompanionAssistantDisplay />);
    expect(screen.getByRole("tab", { name: "스크롤 페이싱" }).getAttribute("title")).toBe(
      "스크롤 페이싱",
    );
  });

  it("활성 탭의 aria-controls 가 실제 렌더된 tabpanel 을 가리킨다", () => {
    render(<StudioCompanionAssistantDisplay />);

    const activeTab = screen.getByRole("tab", { name: "플랫폼 규격" });
    const panel = screen.getByRole("tabpanel");
    expect(activeTab.getAttribute("aria-controls")).toBe(`${TAB_PREFIX}-panel-spec-slicer`);
    expect(panel.getAttribute("id")).toBe(`${TAB_PREFIX}-panel-spec-slicer`);
    expect(panel.getAttribute("aria-labelledby")).toBe(`${TAB_PREFIX}-tab-spec-slicer`);
  });

  it("방향키로 탭을 순환 선택한다(roving tabIndex 유지)", () => {
    render(<StudioCompanionAssistantDisplay />);

    const first = screen.getByRole("tab", { name: "플랫폼 규격" });
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "스크롤 페이싱" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(first.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(screen.getByRole("tab", { name: "스크롤 페이싱" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "크로키 가이드" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});

describe("StudioCompanionAssistantDisplay — 효과음 목록", () => {
  it("잘라낸 결과를 숨기지 않고 개수와 더 보기 어포던스를 함께 보여준다", () => {
    openSfxTab();

    // 사전 전체는 20개. 처음엔 6개만 그리되 그 사실을 화면에 적는다.
    expect(screen.getByText("총 20개 중 6개 표시")).toBeTruthy();

    const more = screen.getByRole("button", { name: "더 보기 (+14)" });
    fireEvent.click(more);

    expect(screen.getByText("총 20개 중 12개 표시")).toBeTruthy();
    expect(screen.getByRole("button", { name: "더 보기 (+8)" })).toBeTruthy();
  });

  it("검색어가 바뀌면 펼쳐둔 개수를 처음으로 되돌린다", () => {
    openSfxTab();
    fireEvent.click(screen.getByRole("button", { name: "더 보기 (+14)" }));
    expect(screen.getByText("총 20개 중 12개 표시")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "의성어·의태어 검색" }), {
      target: { value: "쿵" },
    });
    expect(screen.queryByText(/12개 표시/)).toBeNull();
  });

  it("결과가 없으면 빈 공간 대신 StudioEmptyState 와 초기화 경로를 준다", () => {
    openSfxTab();

    const search = screen.getByRole("searchbox", { name: "의성어·의태어 검색" });
    fireEvent.change(search, { target: { value: "존재하지않는효과음" } });

    expect(document.querySelector('[data-studio-empty-state="true"]')).toBeTruthy();
    expect(screen.getByText("검색 결과가 없습니다")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(document.querySelector('[data-studio-empty-state="true"]')).toBeNull();
    expect(screen.getByText("총 20개 중 6개 표시")).toBeTruthy();
  });

  it("흰색 글리프가 라이트 테마에서 사라지지 않도록 외곽선을 함께 입힌다", () => {
    openSfxTab();

    // `퍽` 은 #ffffff 본문 + #dc2626 외곽선을 전제로 만들어진 레터링 데이터다.
    const glyph = screen.getByText("퍽");
    expect(glyph.getAttribute("style")).toContain("text-shadow");
    expect(glyph.getAttribute("style")).toContain("#dc2626");
  });

  it("복사 버튼이 아이콘 모양이 아니라 이름으로 상태를 알린다", () => {
    openSfxTab();
    expect(screen.getByRole("button", { name: "쿵 복사" })).toBeTruthy();
  });
});

describe("StudioCompanionAssistantDisplay — 클립보드", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "execCommand");
  });

  function stubClipboard(writeText: () => Promise<void>) {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  }

  it("복사가 실제로 성공했을 때만 복사됨을 알린다", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);

    openSfxTab();
    fireEvent.click(screen.getByRole("button", { name: "쿵 복사" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("복사됨");
    });
    expect(writeText).toHaveBeenCalledWith("쿵");
    expect(screen.getByRole("button", { name: "쿵 복사됨" })).toBeTruthy();
  });

  it("클립보드가 막히면 거짓 성공 대신 실패를 알린다", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    // 폴백(execCommand)도 실패시켜 두 경로가 모두 막힌 상황을 만든다.
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
      writable: true,
    });

    openSfxTab();
    fireEvent.click(screen.getByRole("button", { name: "쿵 복사" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("복사 실패");
    });
    expect(screen.getByRole("button", { name: "쿵 복사 실패" })).toBeTruthy();
  });

  it("언마운트 뒤에는 리셋 타이머가 상태를 건드리지 않는다", async () => {
    stubClipboard(() => Promise.resolve());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const view = render(<StudioCompanionAssistantDisplay />);
    openTab("효과음 사전");
    fireEvent.click(screen.getByRole("button", { name: "쿵 복사" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("복사됨");
    });

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("StudioCompanionAssistantDisplay — 피부톤 팔레트", () => {
  it("모달과 같은 5개 표준 톤을 모두 노출한다(유일한 어두운 톤 포함)", () => {
    render(<StudioCompanionAssistantDisplay />);
    openTab("컬러 조화");

    for (const name of [
      "아이보리 웜톤 (주인공 표준)",
      "쿨톤 창백 (로판 남주/뱀파이어)",
      "생기 피치 홍조 (히로인/소녀)",
      "건강한 구릿빛 태닝 (액션/스포츠)",
      "딥 브라운 / 다크 엘프 (판타지)",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("색 띠 묶음에 접근 가능한 이름과 띠별 title 을 준다", () => {
    render(<StudioCompanionAssistantDisplay />);
    openTab("컬러 조화");

    const swatch = screen.getByRole("img", {
      name: "딥 브라운 / 다크 엘프 (판타지) 밑색·1차 음영·2차 음영",
    });
    expect(
      Array.from(swatch.children).map((band) => band.getAttribute("title")),
    ).toEqual(["밑색", "1차 음영", "2차 음영"]);
  });
});

describe("StudioCompanionAssistantDisplay — 터치 타깃 · 포커스 링", () => {
  it("탭 본문의 모든 버튼이 공용 포커스 링과 44px 터치 타깃을 갖는다", () => {
    const { container } = render(<StudioCompanionAssistantDisplay />);

    for (const label of ["효과음 사전", "컬러 조화", "포커스 타이머", "크로키 가이드"]) {
      openTab(label);
      const buttons = Array.from(container.querySelectorAll("button"));
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button.className).toContain("focus-visible:outline-accent");
        expect(button.className).toContain("min-h-11");
      }
    }
  });

  it("장식용 lucide 아이콘은 접근성 트리에서 감춘다", () => {
    const { container } = render(<StudioCompanionAssistantDisplay />);
    const icons = Array.from(container.querySelectorAll("svg.lucide"));
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
