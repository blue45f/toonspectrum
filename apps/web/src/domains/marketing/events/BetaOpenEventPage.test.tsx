// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BetaOpenEventPage } from "./BetaOpenEventPage";

const session = {
  data: null,
  ready: false,
  status: "unauthenticated" as "authenticated" | "unauthenticated",
  update: async () => null,
};

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => session,
}));

afterEach(cleanup);

describe("BetaOpenEventPage 세션 판정 중 CTA", () => {
  it("세션 판정이 끝나기 전에는 회원가입 CTA 대신 확인 중 표시를 보여준다", () => {
    session.ready = false;
    session.status = "unauthenticated";
    render(
      <MemoryRouter>
        <BetaOpenEventPage />
      </MemoryRouter>,
    );
    // 하단 마감 섹션도 같은 게이트를 지켜야 한다 — 판정 전에 가입 버튼이 노출되면
    // 이미 로그인한 사용자에게 가입 모달이 뜬다. 확인 중 표시는 상·하단 2곳이다.
    expect(screen.getAllByText(/로그인 상태 확인 중/).length).toBe(2);
    expect(screen.queryByRole("button", { name: /가입하고/ })).toBeNull();
  });

  it("판정 후 로그인 상태면 스튜디오 CTA를 보여준다", () => {
    session.ready = true;
    session.status = "authenticated";
    render(
      <MemoryRouter>
        <BetaOpenEventPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/로그인 상태 확인 중/)).toBeNull();
    expect(screen.getAllByRole("link", { name: /바로 시작하기/ }).length).toBeGreaterThan(0);
  });
});
