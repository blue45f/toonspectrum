// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthModal } from "./auth-modal";

const fetchMock = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const signInWithGoogleIdToken = vi.hoisted(() => vi.fn());

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  signIn,
  signInWithGoogleIdToken,
}));

function InitiallyOpenAuthModal() {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        로그인 열기
      </button>
      {open && (
        <AuthModal
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  );
}

describe("AuthModal focus return", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        google: { label: "Google", mode: "disabled" },
      }),
    });
    signIn.mockReset();
    signInWithGoogleIdToken.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    delete window.google;
    vi.unstubAllGlobals();
  });

  it("returns focus to an explicit live trigger even when the modal mounted after a lazy fallback was replaced", async () => {
    render(<InitiallyOpenAuthModal />);

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "이메일" }),
      );
    });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "로그인 열기" }),
      );
    });
  });

  it("keeps the close control at the 44px touch-target size", () => {
    render(<InitiallyOpenAuthModal />);

    expect(
      screen.getByRole("button", { name: "로그인 창 닫기" }).className,
    ).toContain("size-11");
  });

  it("does not expose the full-screen backdrop to the global tooltip layer", () => {
    render(<InitiallyOpenAuthModal />);

    expect(
      document.querySelector('[data-auth-overlay="true"] > button')?.getAttribute(
        "data-app-tooltip-exclude",
      ),
    ).toBe("true");
  });

  it("locks only background branches and restores them after close", async () => {
    const { container } = render(<InitiallyOpenAuthModal />);
    const dialog = screen.getByRole("dialog", { name: "다시 만나 반가워요" });

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(container.hasAttribute("inert")).toBe(true);
    expect(container.getAttribute("aria-hidden")).toBe("true");
    expect(dialog.hasAttribute("inert")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "로그인 창 닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(container.hasAttribute("inert")).toBe(false);
    expect(container.hasAttribute("aria-hidden")).toBe(false);
  });

  it("lets people reveal and hide the password without replacing the field", () => {
    render(<InitiallyOpenAuthModal />);
    const password = screen.getByLabelText<HTMLInputElement>("비밀번호");

    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 표시" }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 숨기기" }));
    expect(password.type).toBe("password");
  });

  it("Google 로그인 실패를 모달에서 한 번만 알린다", async () => {
    const error = "Google 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
    let credentialCallback: ((response: { credential?: string }) => void) | null = null;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        google: {
          label: "Google",
          mode: "oauth",
          clientId: "client.apps.googleusercontent.com",
        },
      }),
    });
    signInWithGoogleIdToken.mockResolvedValue({
      ok: false,
      error,
      status: 503,
    });
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((config) => {
            credentialCallback = config.callback;
          }),
          renderButton: vi.fn((parent) => {
            const button = document.createElement("button");
            button.textContent = "Continue with Google";
            parent.appendChild(button);
          }),
        },
      },
    };

    render(<InitiallyOpenAuthModal />);
    await screen.findByRole("button", { name: "Continue with Google" });

    await act(async () => {
      credentialCallback?.({ credential: "header.payload.signature" });
    });

    await screen.findByText(error);
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Google로 다시 시도" })).toBeTruthy();
  });
});
