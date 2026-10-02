// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LearnPage } from "./LearnPage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("공통 학습 탐색", () => {
  it("첫 화면에는 하나의 탐색만 표시하고 전체 메뉴에 기존 목적지를 보존한다", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    const navigation = screen.getAllByRole("navigation", { name: "웹툰 학습" });
    expect(navigation).toHaveLength(1);
    const menu = within(navigation[0]);
    expect(menu.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/learn", "/learn/resources", "/learn/classroom",
    ]);
    fireEvent.click(menu.getByText("전체 메뉴"));
    await menu.findByRole("link", { name: "용어 사전" });
    expect(menu.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      // 학습 → 리서치 → 제작 동선: 전체 메뉴 맨 앞에 리서치 데스크가 있다.
      "/learn", "/learn/resources", "/learn/classroom", "/research", "/learn#learning-paths",
      "/learn/glossary", "/learn/studio", "/learn/trace", "/learn/process",
      "/learn/careers", "/learn/education", "/learn/records",
    ]);
    fireEvent.keyDown(menu.getByRole("link", { name: "용어 사전" }), { key: "Escape" });
    expect(menu.queryByRole("link", { name: "용어 사전" })).toBeNull();
    expect(document.activeElement?.tagName).toBe("SUMMARY");
  });

  it("메뉴로 다른 학습 화면에 이동하면 선택 상태를 표시하고 목록을 닫는다", async () => {
    render(<MemoryRouter initialEntries={["/learn"]}><LearnPage /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "웹툰 학습" });
    fireEvent.click(within(navigation).getByText("전체 메뉴"));
    fireEvent.click(await within(navigation).findByRole("link", { name: "따라 그리기" }));
    expect(screen.getByRole("heading", { name: /참고 이미지는 가이드로/u })).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "웹툰 학습" })).toHaveLength(1);
    const currentNavigation = screen.getByRole("navigation", { name: "웹툰 학습" });
    const summary = currentNavigation.querySelector("summary");
    expect(summary?.getAttribute("data-current")).toBe("true");
    expect(summary?.textContent).toContain("따라 그리기");
    expect(currentNavigation.querySelector("details")?.open).toBe(false);
  });

  it("학습 기록 화면도 같은 메뉴를 사용하며 백업 기능을 유지한다", () => {
    render(<MemoryRouter initialEntries={["/learn/records"]}><LearnPage /></MemoryRouter>);
    expect(screen.getAllByRole("navigation", { name: "웹툰 학습" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: /배운 과정도/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "내 학습 기록 보관" })).toBeTruthy();
  });
});
