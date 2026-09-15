import { describe, expect, it, vi } from "vitest";

import {
  AuthEmailConfigurationError,
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
