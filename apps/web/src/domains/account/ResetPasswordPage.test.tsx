// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "./ResetPasswordPage";

const apiRaw = vi.hoisted(() => vi.fn());

vi.mock("@/platform/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
}));

function page(entry: string) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <ResetPasswordPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiRaw.mockReset();
});

afterEach(cleanup);

describe("ResetPasswordPage", () => {
  it("renders the rule checklist and sends the completed form to the sign-in screen", async () => {
    apiRaw.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    render(page("/auth/reset-password?token=reset-token"));

    expect(screen.getByRole("heading", { level: 1, name: "비밀번호 재설정" })).toBeTruthy();
    expect(screen.getByText("15자 이상")).toBeTruthy();
    expect(screen.getByText("두 비밀번호 일치")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "a-long-new-password" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "a-long-new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "새 비밀번호로 변경" }));

    await waitFor(() => {
      expect(screen.getByText(/새 비밀번호로 변경했어요/)).toBeTruthy();
    });
    expect(apiRaw).toHaveBeenCalledWith(
      "/api/auth/password/reset/confirm",
      expect.objectContaining({ method: "POST", json: { token: "reset-token", password: "a-long-new-password" } })
    );
    // 완료 후에는 홈이 아니라 로그인 화면으로 바로 이어진다.
    expect(screen.getByRole("link", { name: "로그인하러 가기" }).getAttribute("href")).toBe("/auth/login");
  });

  it("blocks the form without a token and points back to the sign-in screen for a new link", () => {
    render(page("/auth/reset-password"));
    expect(screen.getByRole("alert").textContent).toContain("재설정 링크가 올바르지 않아요.");
    expect((screen.getByLabelText("새 비밀번호") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "로그인 화면으로" }).getAttribute("href")).toBe("/auth/login");
  });
});
