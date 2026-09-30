// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AccountNudgeHost,
} from "./account-required-nudge";
import { useAccountGate } from "./use-account-gate";
import { requestAccountNudge } from "./account-nudge-bus";
import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { endGuestSession, startGuestSession } from "@/domains/auth/public/session/guest-session";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  endGuestSession();
  vi.restoreAllMocks();
});

const signedOut: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

const signedIn = {
  data: { user: { id: "user-1", name: "테스트" } },
  ready: true,
  status: "authenticated",
  update: async () => null,
} as SessionContextValue;

function Probe({ action }: { action: "save" }) {
  const { ensureAccount } = useAccountGate();
  return (
    <button type="button" onClick={() => ensureAccount(action)}>
      probe
    </button>
  );
}

describe("account-required-nudge", () => {
  it("lets signed-in creators through without a dialog", () => {
    const onResult = vi.fn();
    function Check() {
      const { ensureAccount } = useAccountGate();
      return (
        <button type="button" onClick={() => onResult(ensureAccount("save"))}>
          check
        </button>
      );
    }
    render(
      <SessionContext.Provider value={signedIn}>
        <AccountNudgeHost />
        <Check />
      </SessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "check" }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a gentle dialog for signed-out visitors", () => {
    render(
      <SessionContext.Provider value={signedOut}>
        <AccountNudgeHost />
        <Probe action="save" />
      </SessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "probe" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("저장하려면 로그인이 필요해요");
  });

  it("mentions guest work preservation for guests", () => {
    startGuestSession();
    render(
      <SessionContext.Provider value={signedOut}>
        <AccountNudgeHost />
        <Probe action="publish" />
      </SessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "probe" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("게스트로 만든 작업물은 이 브라우저에 그대로 있어요");
  });

  it("dismisses with Escape and the later button", () => {
    render(
      <SessionContext.Provider value={signedOut}>
        <AccountNudgeHost />
        <Probe action="comment" />
      </SessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "probe" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "probe" }));
    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requestAccountNudge opens the dialog directly", () => {
    render(
      <SessionContext.Provider value={signedOut}>
        <AccountNudgeHost />
      </SessionContext.Provider>,
    );
    act(() => {
      requestAccountNudge({ action: "payment", isGuest: false });
    });
    expect(screen.getByRole("dialog").textContent).toContain("결제는 로그인 후 이용할 수 있어요");
  });
});
