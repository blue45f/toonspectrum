// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionContextValue } from "@/domains/auth/public/session/auth-session-store";

import { AuthEntryPage } from "./AuthEntryPage";

const mocks = vi.hoisted(() => ({
  session: { data: null, ready: false, status: "unauthenticated", update: async () => null } as SessionContextValue,
}));

// 실제 인증 폼은 제공자 탐색·OAuth를 포함하므로, 이 화면이 폼을 "페이지 본문에 직접" 그리는지와
// 어떤 모드로 여는지만 본다. 폼 안 제목이 페이지의 h1이 되는 계약(페이지형)까지 흉내 낸다.
vi.mock("@/domains/auth/public/account-auth-form", () => ({
  AuthForm: ({ initialMode, variant }: { readonly initialMode?: "login" | "signup"; readonly variant?: string }) => (
    <div data-testid="auth-form" data-mode={initialMode ?? "login"} data-variant={variant ?? "dialog"}>
      <h1>{initialMode === "signup" ? "새 창작 여정을 시작해요" : "다시 만나 반가워요"}</h1>
    </div>
  ),
}));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => mocks.session,
}));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

function entry(mode: "login" | "signup") {
  return (
    <MemoryRouter initialEntries={[`/auth/${mode}`]}>
      <AuthEntryPage mode={mode} />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("AuthEntryPage", () => {
  it("shows a skeleton instead of the form until the session check finishes, then renders the form in the page body", () => {
    mocks.session = { data: null, ready: false, status: "unauthenticated", update: async () => null };
    const { rerender } = render(entry("login"));
    // 세션 확인 전에는 폼을 그리지 않는다(로그인된 사용자에게 폼이 잠깐 보이는 깜빡임 방지).
    expect(screen.queryByTestId("auth-form")).toBeNull();
    expect(screen.getByRole("status", { name: "세션을 확인하고 있어요" })).toBeTruthy();

    mocks.session = { data: null, ready: true, status: "unauthenticated", update: async () => null };
    rerender(entry("login"));
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-mode")).toBe("login");
    // 자동 대화상자가 아니라 페이지 본문 폼(page 변형)으로 그린다.
    expect(form.getAttribute("data-variant")).toBe("page");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "로그인 없이 바로 해 볼 수 있어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 작품 만들기/ }).getAttribute("href")).toBe("/studio/new");
  });

  it("uses the sign-up mode for the sign-up address", () => {
    mocks.session = { data: null, ready: true, status: "unauthenticated", update: async () => null };
    render(entry("signup"));
    const form = screen.getByTestId("auth-form");
    expect(form.getAttribute("data-mode")).toBe("signup");
    expect(form.getAttribute("data-variant")).toBe("page");
    expect(screen.getByRole("heading", { level: 1, name: "새 창작 여정을 시작해요" })).toBeTruthy();
  });

  it("never renders the form for a signed-in account and offers the next places instead", () => {
    mocks.session = {
      data: { user: { id: "u1", name: "하린", email: "harin@example.com" } },
      ready: true,
      status: "authenticated",
      update: async () => null,
    } as SessionContextValue;
    render(entry("login"));
    expect(screen.queryByTestId("auth-form")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "이미 로그인되어 있어요" })).toBeTruthy();
    expect(screen.getByText(/하린/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "내 공간으로" }).getAttribute("href")).toBe("/my");
    expect(screen.getByRole("link", { name: /Studio 열기/ }).getAttribute("href")).toBe("/studio");
  });
});
