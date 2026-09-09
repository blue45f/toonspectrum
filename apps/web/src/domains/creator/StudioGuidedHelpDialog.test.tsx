// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioGuidedHelpDialog } from "./StudioGuidedHelpDialog";

const BASE_PROPS = {
  open: true,
  initialToolCommandId: null,
  onClose: vi.fn(),
  onOpenSupport: vi.fn(),
  onOpenCommandSearch: vi.fn(),
  onOpenManual: vi.fn(),
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

describe("StudioGuidedHelpDialog", () => {
  it("closed 이면 렌더하지 않는다", () => {
    const { container } = render(
      <StudioGuidedHelpDialog {...BASE_PROPS} open={false} />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("현재 도구 요청을 즉시 30초 가이드와 문제 해결로 연다", () => {
    render(
      <StudioGuidedHelpDialog
        {...BASE_PROPS}
        initialToolCommandId="tool.fill"
      />,
    );

    expect(screen.getByRole("heading", { name: "닫힌 영역 색 채우기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "30초 시작" })).toBeTruthy();
    expect(screen.getByText("페이지 전체가 칠해졌어요")).toBeTruthy();
    expect(screen.getByText("단축키 G")).toBeTruthy();
  });

  it("한국어·타사 용어로 작성형 도움말을 찾고 문서로 들어간다", () => {
    render(<StudioGuidedHelpDialog {...BASE_PROPS} />);
    const search = screen.getByRole("searchbox", { name: "도움말 검색" });

    fireEvent.change(search, { target: { value: "QuickShape" } });
    expect(screen.getByRole("status").textContent).toContain("검색 결과 1개");
    fireEvent.click(
      screen.getByRole("button", { name: /스마트 도형으로 선 정리하기/u }),
    );

    expect(screen.getByRole("heading", { name: "스마트 도형으로 선 정리하기" })).toBeTruthy();
    expect(screen.getByText("그냥 자유선으로 남아요")).toBeTruthy();
  });

  it("검색 실패는 빈 막다른 길 대신 전체 F1 검색으로 복구한다", () => {
    const onOpenCommandSearch = vi.fn();
    render(
      <StudioGuidedHelpDialog
        {...BASE_PROPS}
        onOpenCommandSearch={onOpenCommandSearch}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "도움말 검색" }), {
      target: { value: "존재하지않는도움말xyz" },
    });
    expect(screen.getByText("작성형 가이드에서 찾지 못했습니다")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "F1 기능·설정 찾기 열기" }),
    );
    expect(onOpenCommandSearch).toHaveBeenCalledOnce();
  });

  it("실측 지원·전체 검색·매뉴얼을 각 소유 표면으로 위임한다", () => {
    const onOpenSupport = vi.fn();
    const onOpenCommandSearch = vi.fn();
    const onOpenManual = vi.fn();
    render(
      <StudioGuidedHelpDialog
        {...BASE_PROPS}
        onOpenSupport={onOpenSupport}
        onOpenCommandSearch={onOpenCommandSearch}
        onOpenManual={onOpenManual}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /복구 가이드/u })[0]!);
    expect(onOpenSupport).toHaveBeenCalledWith("recovery");

    fireEvent.click(screen.getByRole("button", { name: "F1 전체 검색" }));
    expect(onOpenCommandSearch).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "사용자 매뉴얼" }));
    expect(onOpenManual).toHaveBeenCalledOnce();
  });

  it("배경과 스크롤을 잠그고 Tab·Esc·opener 복귀 계약을 지킨다", () => {
    const opener = document.createElement("button");
    opener.textContent = "도움말 열기";
    document.body.append(opener);
    opener.focus();
    const inertBefore = opener.inert;
    document.body.style.overflow = "clip";
    document.documentElement.style.overflow = "auto";
    const onClose = vi.fn();

    const view = render(
      <StudioGuidedHelpDialog {...BASE_PROPS} onClose={onClose} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(opener.inert).toBe(true);

    const dialog = screen.getByRole("dialog");
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),details>summary,[tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.tabIndex >= 0);
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<StudioGuidedHelpDialog {...BASE_PROPS} open={false} />);
    expect(document.body.style.overflow).toBe("clip");
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(opener.inert).toBe(inertBefore);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("모바일 안전영역과 주요 조작에 44px 터치 영역을 유지한다", () => {
    render(<StudioGuidedHelpDialog {...BASE_PROPS} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(screen.getByRole("searchbox", { name: "도움말 검색" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "도움말 닫기" }).className).toContain("size-11");
    const navigation = screen.getByRole("navigation", { name: "도움말 바로가기" });
    expect(within(navigation).getByRole("button", { name: /도움말 홈/u }).className).toContain("min-h-11");
  });
});
