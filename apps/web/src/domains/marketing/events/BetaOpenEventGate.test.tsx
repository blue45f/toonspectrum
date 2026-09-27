// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BetaOpenEventGate } from "./BetaOpenEventGate";
import { BETA_OPEN_EVENT } from "./event-catalog";
import { eventSeenStorageKey } from "./event-seen";

const session = {
  data: null,
  ready: true,
  status: "unauthenticated" as const,
  update: async () => null,
};

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => session,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T05:00:00+09:00"));
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderGate() {
  return render(
    <MemoryRouter>
      <button type="button">작품 둘러보기</button>
      <BetaOpenEventGate pathname="/discover" />
    </MemoryRouter>,
  );
}

describe("BetaOpenEventGate", () => {
  it("waits for meaningful engagement and never blocks the page as a modal", () => {
    renderGate();

    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "작품 둘러보기" }));
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();

    act(() => vi.advanceTimersByTime(8_000));
    fireEvent.scroll(window);

    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps benefit details collapsed and persists dismissal", () => {
    renderGate();
    act(() => vi.advanceTimersByTime(32_000));

    expect(screen.queryByText("주요 서비스 이용료 무료 · 공정 사용 한도 적용")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "혜택·조건" }));
    expect(screen.getByText("주요 서비스 이용료 무료 · 공정 사용 한도 적용")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "베타 혜택 닫기" }));
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    expect(window.localStorage.getItem(eventSeenStorageKey(BETA_OPEN_EVENT.id))).toBe("1");
  });

  it("포인터를 누르고 떼는 사이에는 안내를 표시하지 않고 원래 클릭을 완료한다", () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <button type="button" onClick={onClick}>실습 시작</button>
        <BetaOpenEventGate pathname="/learn/lessons/story-board" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(8_000));
    const action = screen.getByRole("button", { name: "실습 시작" });

    fireEvent.pointerDown(action);
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    fireEvent.pointerUp(action);
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
  });

  it("does not mount on the product orientation route", () => {
    render(
      <MemoryRouter>
        <BetaOpenEventGate pathname="/" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
  });

  it.each(["aria", "native"])("%s 대화상자가 열려 있으면 노출을 보류하고 다음 페이지 조작에서 재개한다", (kind) => {
    renderGate();
    const dialog = document.createElement(kind === "native" ? "dialog" : "div");
    if (kind === "native") dialog.setAttribute("open", "");
    else {
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
    }
    document.body.append(dialog);
    try {
      act(() => vi.advanceTimersByTime(32_000));
      fireEvent.click(dialog);
      expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
      expect(window.localStorage.getItem(eventSeenStorageKey(BETA_OPEN_EVENT.id))).toBeNull();
    } finally {
      dialog.remove();
    }

    fireEvent.click(screen.getByRole("button", { name: "작품 둘러보기" }));
    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
  });

  it("열린 탐색 메뉴에는 안내를 유예하지만 본문 FAQ는 계속 사용할 수 있다", () => {
    const view = render(
      <MemoryRouter>
        <nav aria-label="학습 탐색"><details open><summary>전체 메뉴</summary><a href="/learn/records">학습 기록</a></details></nav>
        <details open><summary>학습 FAQ</summary><p>기록은 현재 브라우저에 저장됩니다.</p></details>
        <button type="button">본문 조작</button>
        <BetaOpenEventGate pathname="/learn" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(32_000));
    fireEvent.scroll(window);
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();

    view.container.querySelector("nav details")?.removeAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "본문 조작" }));
    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
    expect(screen.getByText("기록은 현재 브라우저에 저장됩니다.")).toBeTruthy();
  });

  it("표시 중인 안내도 탐색 메뉴가 열리면 숨기고 읽음 처리 없이 다음 조작까지 기다린다", async () => {
    const view = render(
      <MemoryRouter>
        <nav aria-label="학습 탐색"><details><summary>전체 메뉴</summary><a href="/learn/records">학습 기록</a></details></nav>
        <button type="button">본문 조작</button>
        <BetaOpenEventGate pathname="/learn" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(32_000));
    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
    const menu = view.container.querySelector("nav details");
    await act(async () => { menu?.setAttribute("open", ""); });
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    expect(window.localStorage.getItem(eventSeenStorageKey(BETA_OPEN_EVENT.id))).toBeNull();

    await act(async () => { menu?.removeAttribute("open"); });
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "본문 조작" }));
    expect(screen.getByRole("region", { name: "베타 오픈 혜택" })).toBeTruthy();
  });
});
