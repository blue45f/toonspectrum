// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthActionPage } from "./AuthActionPage";

vi.mock("./AuthCallbackPage", () => ({
  AuthCallbackPage: () => <div>callback-page</div>,
}));

vi.mock("./ResetPasswordPage", () => ({
  ResetPasswordPage: () => <div>reset-page</div>,
}));

vi.mock("./VerifyEmailPage", () => ({
  VerifyEmailPage: () => <div>verify-email-page</div>,
}));

vi.mock("@/components/NotFoundPage", () => ({
  NotFoundPage: () => <div>not-found</div>,
}));

function renderAction(action: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/${action}`]}>
      <Routes>
        <Route path="/auth/:action" element={<AuthActionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("AuthActionPage", () => {
  it("routes callback, reset-password and verify-email actions", () => {
    const { unmount: unmountCallback } = renderAction("callback");
    expect(screen.getByText("callback-page")).toBeTruthy();
    unmountCallback();

    const { unmount: unmountReset } = renderAction("reset-password");
    expect(screen.getByText("reset-page")).toBeTruthy();
    unmountReset();

    renderAction("verify-email");
    expect(screen.getByText("verify-email-page")).toBeTruthy();
  });

  it("renders not found for an unknown auth action", () => {
    renderAction("unknown");
    expect(screen.getByText("not-found")).toBeTruthy();
  });
});
