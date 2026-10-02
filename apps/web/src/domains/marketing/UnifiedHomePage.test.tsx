// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { UnifiedHomePage } from "./UnifiedHomePage";

vi.mock("@/domains/creator-resources/CreatorHomePage", () => ({
  CreatorHomePage: () => <div>사이트 홈</div>,
}));

afterEach(() => cleanup());

function renderHome(value: SessionContextValue) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <SessionContext.Provider value={value}>
        <Routes>
          <Route path="/" element={<UnifiedHomePage />} />
          <Route path="/home" element={<div>내 홈 페이지</div>} />
        </Routes>
      </SessionContext.Provider>
    </MemoryRouter>,
  );
}

describe("통합 홈(/)의 로그인 동선", () => {
  it("로그인 상태에서도 /home으로 강제 이동하지 않고 사이트 홈을 보여 준다", () => {
    renderHome({ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null });
    expect(screen.getByText("사이트 홈")).toBeTruthy();
    expect(screen.queryByText("내 홈 페이지")).toBeNull();
  });

  it("게스트에게도 같은 사이트 홈을 보여 준다", () => {
    renderHome({ data: null, ready: true, status: "unauthenticated", update: async () => null });
    expect(screen.getByText("사이트 홈")).toBeTruthy();
  });

  it("세션을 확인하는 동안에는 준비 화면을 유지한다", () => {
    const { container } = renderHome({ data: null, ready: false, status: "unauthenticated", update: async () => null });
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText("사이트 홈")).toBeNull();
  });
});
