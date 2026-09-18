// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";

import {
  AUTH_MODAL_REQUEST_EVENT,
  type AuthModalRequestDetail,
} from "@/compat/auth-modal-intent";

import { AiRecoveryNotice } from "./AiRecoveryNotice";
import { inferAiRecoveryCode } from "./ai-recovery-code";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderNotice(
  props: ComponentProps<typeof AiRecoveryNotice>,
) {
  return render(
    <MemoryRouter>
      <AiRecoveryNotice {...props} />
    </MemoryRouter>,
  );
}

describe("AiRecoveryNotice", () => {
  it("opens the global login surface without discarding the current AI form", () => {
    const listener = vi.fn((event: Event) => event);
    globalThis.addEventListener(AUTH_MODAL_REQUEST_EVENT, listener);
    renderNotice({
      code: "login_required",
      message: "로그인하면 자동 무료 AI를 바로 사용할 수 있어요.",
    });

    fireEvent.click(screen.getByRole("button", { name: "로그인하고 계속" }));

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0] as CustomEvent<AuthModalRequestDetail>;
    expect(event.detail).toMatchObject({ reason: "free-ai", source: "ai-recovery" });
    expect(screen.getByRole("link", { name: "개인 무료 키 연결" }).getAttribute("href"))
      .toBe("/settings/ai");
    globalThis.removeEventListener(AUTH_MODAL_REQUEST_EVENT, listener);
  });

  it("offers a settings recovery path for exhausted free routes", () => {
    renderNotice({
      code: "free_exhausted",
      message: "현재 무료 AI 사용량이 모두 소진됐어요.",
    });

    expect(screen.queryByRole("button", { name: "로그인하고 계속" })).toBeNull();
    expect(screen.getByRole("link", { name: "AI 설정 열기" }).getAttribute("href"))
      .toBe("/settings/ai");
  });


  it("uses polite status semantics for recoverable setup states and avoids futile retries", () => {
    const retry = vi.fn();
    renderNotice({
      code: "not_configured",
      message: "AI 연결이 필요합니다.",
      onRetry: retry,
    });

    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.getByRole("link", { name: "AI 설정 열기" })).not.toBeNull();
  });

  it("offers retry only for transient failures", () => {
    const retry = vi.fn();
    renderNotice({
      code: "network_error",
      message: "네트워크 연결이 잠시 끊겼어요.",
      onRetry: retry,
    });

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("classifies the production login message before generic quota wording", () => {
    expect(inferAiRecoveryCode(
      "로그인하면 자동 무료 AI를 바로 사용할 수 있어요. 개인 무료 API 키도 연결할 수 있습니다.",
    )).toBe("login_required");
  });
});
