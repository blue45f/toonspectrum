// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MangaToolkitPanel } from "./MangaToolkitPanel";
import { MANGA_TOOLKIT_LABELS as L } from "./manga-toolkit-labels";

afterEach(() => {
  cleanup();
});

describe("MangaToolkitPanel", () => {
  it("제목과 페이지 모드 안내, 3개 탭을 렌더한다", () => {
    render(<MangaToolkitPanel />);
    expect(screen.getByText(L.panelTitle)).toBeTruthy();
    expect(screen.getByText(L.pageModeNotice)).toBeTruthy();
    for (const tab of Object.values(L.tabs)) {
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    }
  });

  it("프레임 분할 탭에서 분할 버튼을 누르면 행×열 수만큼 rect가 미리보기에 그려진다", () => {
    render(<MangaToolkitPanel />);
    fireEvent.click(screen.getByRole("tab", { name: L.tabs.frame }));
    fireEvent.click(screen.getByRole("button", { name: L.frame.split }));
    // 기본 2행×2열 → 4개
    const svg = screen.getByRole("img", { name: L.tabs.frame });
    expect(svg.querySelectorAll("rect")).toHaveLength(4);
  });

  it("말풍선 탭에서 6종 이상 프리셋 버튼이 보인다", () => {
    render(<MangaToolkitPanel />);
    fireEvent.click(screen.getByRole("tab", { name: L.tabs.balloon }));
    expect(screen.getByRole("button", { name: "일반 말풍선" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "생각 풍선" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "외침" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "속삭임" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "사각" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "구름" })).toBeTruthy();
    const preview = screen.getByRole("img", { name: L.balloon.preview });
    expect(preview.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(preview.querySelector("text")?.textContent).toBe("대사 예시");
  });

  it("말풍선 프리셋을 바꾸면 꼬리 path가 재생성된다", () => {
    render(<MangaToolkitPanel />);
    fireEvent.click(screen.getByRole("tab", { name: L.tabs.balloon }));
    fireEvent.click(screen.getByRole("button", { name: "생각 풍선" }));
    const preview = screen.getByRole("img", { name: L.balloon.preview });
    const paths = preview.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
    // 생각 풍선 꼬리는 하나의 path 안에 구름 원 3개 서브패스(M ...)가 이어져 있다
    const tailD = paths[0]?.getAttribute("d") ?? "";
    expect(tailD.split("M").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("효과선 탭에서 종류를 바꾸면 미리보기 path가 유지되고 슬라이더가 보인다", () => {
    render(<MangaToolkitPanel />);
    fireEvent.click(screen.getByRole("tab", { name: L.tabs.effect }));
    expect(screen.getByRole("slider", { name: new RegExp(L.effect.count) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: L.effect.speed }));
    const preview = screen.getByRole("img", { name: L.effect.preview });
    expect(preview.querySelector("path")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: L.effect.flash }));
    expect(screen.getByRole("img", { name: L.effect.preview }).querySelector("path")).toBeTruthy();
  });
});
