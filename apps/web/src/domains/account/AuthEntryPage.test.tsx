// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionContextValue } from "@/domains/auth/public/session/auth-session-store";

import { AuthEntryPage } from "./AuthEntryPage";

const mocks = vi.hoisted(() => ({
  session: { data: null, ready: false, status: "unauthenticated", update: async () => null } as SessionContextValue,
}));

// 실제 로그인 대화상자는 폼·OAuth 탐색을 포함하므로, 이 화면이 대화상자를 "직접" 렌더하는지만 본다.
vi.mock("@/domains/auth/public/account-auth-modal", () => ({
  AuthModal: ({ initialMode, onClose }: { readonly initialMode?: "login" | "signup"; readonly onClose: () => void }) => (
    <div role="dialog" aria-label={`auth-${initialMode ?? "login"}`}>
      <button type="button" onClick={onClose}>
        close-dialog
      </button>
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
  it("opens the sign-in dialog itself once the session check says signed out", () => {
    mocks.session = { data: null, ready: false, status: "unauthenticated", update: async () => null };
    const { rerender } = render(entry("login"));
    // 세션 확인 전에는 열지 않는다(로그인된 사용자에게 잠깐 뜨는 깜빡임 방지).
    expect(screen.queryByRole("dialog")).toBeNull();

    mocks.session = { data: null, ready: true, status: "unauthenticated", update: async () => null };
    rerender(entry("login"));
    expect(screen.getByRole("dialog", { name: "auth-login" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio에 로그인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "처음이라면 회원가입" }).getAttribute("href")).toBe("/auth/signup");
    expect(screen.getByRole("link", { name: /새 작품 만들기/ }).getAttribute("href")).toBe("/studio/new");
  });

  it("does not reopen after closing, but the primary button opens the dialog again", () => {
    mocks.session = { data: null, ready: true, status: "unauthenticated", update: async () => null };
    const { rerender } = render(entry("login"));
    fireEvent.click(screen.getByRole("button", { name: "close-dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // 세션이 다시 보고돼도(같은 로그아웃 상태) 사용자가 닫은 창을 억지로 열지 않는다.
    rerender(entry("login"));
    expect(screen.queryByRole("dialog")).toBeNull();

    const open = screen.getByRole("button", { name: "로그인 창 열기" });
    expect(open.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(open);
    expect(screen.getByRole("dialog", { name: "auth-login" })).toBeTruthy();
  });

  it("opens the button-triggered dialog even before the session check finishes", () => {
    mocks.session = { data: null, ready: false, status: "unauthenticated", update: async () => null };
    render(entry("login"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그인 창 열기" }));
    expect(screen.getByRole("dialog", { name: "auth-login" })).toBeTruthy();
  });

  it("uses the sign-up mode for the sign-up address", () => {
    mocks.session = { data: null, ready: true, status: "unauthenticated", update: async () => null };
    render(entry("signup"));
    expect(screen.getByRole("dialog", { name: "auth-signup" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio 시작하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "회원가입 창 열기" })).toBeTruthy();
  });

  it("never opens the dialog for a signed-in account and offers the next places instead", () => {
    mocks.session = {
      data: { user: { id: "u1", name: "하린", email: "harin@example.com" } },
      ready: true,
      status: "authenticated",
      update: async () => null,
    } as SessionContextValue;
    render(entry("login"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "이미 로그인되어 있어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "내 공간으로" }).getAttribute("href")).toBe("/my");
  });
});
