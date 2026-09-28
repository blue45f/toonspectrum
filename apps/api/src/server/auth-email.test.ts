import { describe, expect, it, vi } from "vitest";

import {
  AuthEmailConfigurationError,
  authEmailAvailability,
  isAuthEmailDeliveryConfigured,
  resolveAuthEmailConfig,
  sendAuthEmail,
} from "./auth-email";

describe("authentication email delivery", () => {
  it("stays disabled when delivery credentials are absent", () => {
    expect(resolveAuthEmailConfig({}).provider).toBe("disabled");
  });

  it("requires both provider key and sender identity", () => {
    expect(() => resolveAuthEmailConfig({
      AUTH_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "fixture-provider-key",
      WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
    })).toThrow(AuthEmailConfigurationError);
  });

  it("sends a one-time link without exposing provider credentials", async () => {
    const fetchImpl = vi.fn(async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer fixture-provider-key");
      expect(String(init?.body)).not.toContain("fixture-provider-key");
      expect(String(init?.body)).toContain("/auth/verify-email?token=");
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    await expect(sendAuthEmail({
      purpose: "verify-email",
      to: "reader@example.com",
      token: "fixture-token",
    }, {
      environment: {
        AUTH_EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "fixture-provider-key",
        AUTH_EMAIL_FROM: "ToonStudio <account@example.com>",
        WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
      },
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toEqual({ providerMessageId: "email_123" });
  });
});

describe("이메일 가입 준비 상태", () => {
  it.each([
    [{}, "disabled"],
    [{ AUTH_EMAIL_PROVIDER: "disabled", RESEND_API_KEY: "fixture-key", AUTH_EMAIL_FROM: "Sender <from@example.test>" }, "disabled"],
    [{ AUTH_EMAIL_PROVIDER: "resend" }, "missing-key"],
    [{ RESEND_API_KEY: "fixture-key" }, "missing-sender"],
    [{ AUTH_EMAIL_PROVIDER: "unknown" }, "invalid-configuration"],
    [{ RESEND_API_KEY: "fixture-key", AUTH_EMAIL_FROM: "Sender <from@example.test>", WEB_APP_BASE_URL: "not-a-url" }, "invalid-configuration"],
    [{ RESEND_API_KEY: "fixture-key", AUTH_EMAIL_FROM: "Sender <from@example.test>", WEB_APP_BASE_URL: "https://www.toonstudio.cloud" }, "configured"],
  ])("설정 값 대신 유한한 상태만 반환한다: %j", (environment, reason) => {
    const result = authEmailAvailability(environment);
    expect(result).toEqual({ available: reason === "configured", reason });
    expect(JSON.stringify(result)).not.toContain("fixture-key");
    expect(JSON.stringify(result)).not.toContain("from@example.test");
    expect(result.available).toBe(isAuthEmailDeliveryConfigured(environment));
  });
});
