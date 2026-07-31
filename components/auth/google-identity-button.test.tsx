// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleIdentityButton } from "./google-identity-button";

const signInWithGoogleIdToken = vi.hoisted(() => vi.fn());
const initialize = vi.hoisted(() => vi.fn());
const renderButton = vi.hoisted(() => vi.fn());
let credentialCallback: ((response: { credential?: string }) => void) | null = null;

vi.mock("@/src/compat/auth-session-store", () => ({
  signInWithGoogleIdToken,
}));

describe("Google Identity Services 로그인 버튼", () => {
  beforeAll(() => {
    initialize.mockImplementation(
      (config: { callback: (response: { credential?: string }) => void }) => {
        credentialCallback = config.callback;
      },
    );
    renderButton.mockImplementation((parent: HTMLElement) => {
      const button = document.createElement("button");
      button.textContent = "Continue with Google";
      parent.appendChild(button);
    });
    window.google = { accounts: { id: { initialize, renderButton } } };
  });

  beforeEach(() => {
    signInWithGoogleIdToken.mockReset();
    renderButton.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("공식 GIS 버튼을 렌더하고 credential 로그인 성공을 부모에 알린다", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    signInWithGoogleIdToken.mockResolvedValue({ ok: true, error: null, status: 200 });

    render(
      <GoogleIdentityButton
        clientId="client.apps.googleusercontent.com"
        onSuccess={onSuccess}
        onError={onError}
      />,
    );

    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client.apps.googleusercontent.com",
        auto_select: false,
        use_fedcm_for_button: true,
      }),
    );
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith("");

    await act(async () => {
      credentialCallback?.({ credential: "header.payload.signature" });
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signInWithGoogleIdToken).toHaveBeenCalledWith(
      "header.payload.signature",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("동일 페이지 재마운트에서도 최신 핸들러로 실패를 표시하고 재시도 UI를 제공한다", async () => {
    const onError = vi.fn();
    signInWithGoogleIdToken.mockResolvedValue({
      ok: false,
      error: "Google 로그인 정보가 만료되었어요.",
      status: 401,
    });

    render(
      <GoogleIdentityButton
        clientId="client.apps.googleusercontent.com"
        onSuccess={vi.fn()}
        onError={onError}
      />,
    );
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));

    await act(async () => {
      credentialCallback?.({ credential: "header.payload.signature" });
    });

    expect(
      await screen.findByText("Google 로그인 정보가 만료되었어요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();
    expect(onError).toHaveBeenLastCalledWith("Google 로그인 정보가 만료되었어요.");
  });
});
