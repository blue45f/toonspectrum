// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthModal } from "./auth-modal";

vi.mock("@/src/compat/auth-session-store", () => ({
  signIn: vi.fn(),
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          google: { label: "Google", mode: "disabled" },
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
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
});
