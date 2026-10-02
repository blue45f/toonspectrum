// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SectionNav } from "./section-nav";

describe("SectionNav — 링크 모드", () => {
  it("현재 경로와 맞는 항목에만 aria-current=page를 단다", () => {
    render(
      <MemoryRouter initialEntries={["/research/books"]}>
        <SectionNav
          label="리서치 메뉴"
          groups={[
            {
              id: "refs",
              label: "자료",
              items: [
                { id: "assets", label: "에셋", href: "/research/assets" },
                { id: "books", label: "도서", href: "/research/books" },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "도서" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "에셋" }).getAttribute("aria-current")).toBeNull();
    // 내비는 DOM에 하나만 존재한다 — 데스크톱/모바일 이중 렌더링 금지(표준 S-2).
    expect(screen.getAllByRole("navigation", { name: "리서치 메뉴" })).toHaveLength(1);
  });

  it("하위 경로에서도 부모 항목이 현재 위치로 표시되고, 루트(/)는 정확 일치만 인정한다", () => {
    render(
      <MemoryRouter initialEntries={["/research/books/123"]}>
        <SectionNav
          label="메뉴"
          items={[
            { id: "home", label: "홈", href: "/" },
            { id: "books", label: "도서", href: "/research/books" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "도서" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("aria-current")).toBeNull();
  });

  it("접을 수 있는 그룹은 aria-expanded로 상태를 알리고, 현재 항목이 든 그룹은 접힌 채 시작하지 않는다", () => {
    render(
      <MemoryRouter initialEntries={["/research/books"]}>
        <SectionNav
          label="메뉴"
          groups={[
            {
              id: "closed",
              label: "닫힌 묶음",
              collapsible: true,
              defaultCollapsed: true,
              items: [{ id: "a", label: "항목A", href: "/a" }],
            },
            {
              id: "current",
              label: "현재 묶음",
              collapsible: true,
              defaultCollapsed: true,
              items: [{ id: "books", label: "도서", href: "/research/books" }],
            },
          ]}
        />
      </MemoryRouter>,
    );
    const closedToggle = screen.getByRole("button", { name: /닫힌 묶음/ });
    expect(closedToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(closedToggle);
    expect(closedToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /현재 묶음/ }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("SectionNav — 탭 모드", () => {
  const items = [
    { id: "display", label: "화면·음성" },
    { id: "region", label: "지역·필터" },
    { id: "data", label: "연령·데이터" },
    { id: "account", label: "계정" },
  ];

  it("SiteTabPanel 계약과 같은 id·aria를 렌더링한다", () => {
    render(
      <SectionNav mode="tabs" label="설정 영역" idPrefix="settings" items={items} value="display" onChange={() => {}} />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.id)).toEqual([
      "settings-tab-display",
      "settings-tab-region",
      "settings-tab-data",
      "settings-tab-account",
    ]);
    expect(screen.getByRole("tab", { name: "화면·음성" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "화면·음성" }).getAttribute("aria-controls")).toBe("settings-panel-display");
  });

  it("클릭과 방향키(→·Home·End)로 선택이 이동한다", () => {
    const onChange = vi.fn();
    render(
      <SectionNav mode="tabs" label="설정 영역" idPrefix="settings" items={items} value="display" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "계정" }));
    expect(onChange).toHaveBeenCalledWith("account");
    fireEvent.keyDown(screen.getByRole("tab", { name: "화면·음성" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("region");
    fireEvent.keyDown(screen.getByRole("tab", { name: "화면·음성" }), { key: "End" });
    expect(onChange).toHaveBeenCalledWith("account");
  });
});
