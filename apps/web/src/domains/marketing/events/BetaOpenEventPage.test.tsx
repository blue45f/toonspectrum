// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BetaOpenEventPage } from "./BetaOpenEventPage";

const session = {
  data: null,
  ready: false,
  status: "unauthenticated" as const,
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
    expect(screen.getByText(/로그인 상태 확인 중/)).toBeTruthy();
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
