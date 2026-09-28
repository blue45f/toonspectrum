import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthController } from "./auth.controller";

vi.mock("../../server/app-config", () => ({
  getAppConfig: vi.fn(async () => ({ authKakao: true, authNaver: false })),
}));
vi.mock("../../server/oauth", async (original) => ({
  ...(await original<typeof import("../../server/oauth")>()),
  listAuthProviders: vi.fn(() => ({ google: { mode: "oauth", clientId: "fixture.apps.googleusercontent.com", redirectAvailable: false } })),
}));
afterEach(() => vi.unstubAllEnvs());

describe("인증 제공자 응답의 이메일 준비 상태", () => {
  it("기존 OAuth 응답을 유지하며 구성 값은 노출하지 않는다", async () => {
    vi.stubEnv("AUTH_EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "fixture-provider-key");
    vi.stubEnv("AUTH_EMAIL_FROM", "");
    const controller = new AuthController({ distributed: false }, { mode: "direct" }, null);
    const result = await controller.getProviders();
    expect(result).toMatchObject({
      google: { mode: "oauth", clientId: "fixture.apps.googleusercontent.com" },
      email: { available: false, reason: "missing-sender" },
    });
    expect(JSON.stringify(result)).not.toContain("fixture-provider-key");
    expect(Object.keys(result.email).sort()).toEqual(["available", "reason"]);
  });
});
