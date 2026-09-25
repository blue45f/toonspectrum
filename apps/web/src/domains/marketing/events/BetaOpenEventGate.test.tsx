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
    fireEvent.pointerDown(screen.getByRole("button", { name: "작품 둘러보기" }));
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

  it("does not mount on the product orientation route", () => {
    render(
      <MemoryRouter>
        <BetaOpenEventGate pathname="/" />
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByRole("region", { name: "베타 오픈 혜택" })).toBeNull();
  });
});
