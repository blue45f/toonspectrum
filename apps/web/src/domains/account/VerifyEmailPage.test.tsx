// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmailPage } from "./VerifyEmailPage";

const apiRaw = vi.hoisted(() => vi.fn());

vi.mock("@/platform/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
}));

function page(entry: string) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <VerifyEmailPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiRaw.mockReset();
});

afterEach(cleanup);

describe("VerifyEmailPage", () => {
  it("verifies with the token and leads straight to the sign-in screen", async () => {
    apiRaw.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    render(page("/auth/verify-email?token=verify-token"));

    await waitFor(() => {
      expect(screen.getByText(/이메일 인증이 완료됐어요/)).toBeTruthy();
    });
    expect(apiRaw).toHaveBeenCalledWith(
      "/api/auth/email/verify",
      expect.objectContaining({ method: "POST", json: { token: "verify-token" } })
    );
    expect(screen.getByRole("link", { name: "로그인하러 가기" }).getAttribute("href")).toBe("/auth/login");
  });

  it("explains the resend path on the sign-in screen when the link is invalid", async () => {
    render(page("/auth/verify-email"));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("인증 링크가 올바르지 않아요.");
    });
    expect(screen.getByText(/로그인 화면에서 이메일 인증 메일을 다시 보낼 수 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인 화면에서 다시 받기" }).getAttribute("href")).toBe("/auth/login");
    expect(apiRaw).not.toHaveBeenCalled();
  });
});
