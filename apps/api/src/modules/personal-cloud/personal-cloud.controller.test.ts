import { describe, expect, it, vi } from "vitest";

import { personalCloudOAuthCookieName } from "./personal-cloud.config";
import { PersonalCloudController } from "./personal-cloud.controller";

import type { PersonalCloudService } from "./personal-cloud.service";
import type { Request, Response } from "express";

function responseFixture(): Response {
  return {
    clearCookie: vi.fn(),
    redirect: vi.fn((url: string) => url),
  } as unknown as Response;
}

function requestFixture(cookie = ""): Request {
  return { headers: cookie ? { cookie } : {} } as Request;
}

describe("PersonalCloudController OAuth callback boundary", () => {
  it.each([
    { code: ["code"], state: "state", error: undefined },
    { code: "code", state: ["state"], error: undefined },
    { code: "code", state: "state", error: ["denied"] },
  ])("rejects non-scalar callback query values before service dispatch", async (query) => {
    const completeConnection = vi.fn();
    const controller = new PersonalCloudController({ completeConnection } as unknown as PersonalCloudService);
    const response = responseFixture();

    await controller.callback(
      "google-drive",
      query.code,
      query.state,
      query.error,
      "user-1",
      requestFixture(),
      response,
    );

    expect(completeConnection).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith(
      personalCloudOAuthCookieName(),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
    const redirect = new URL(String(vi.mocked(response.redirect).mock.calls[0]?.[0]));
    expect(redirect.searchParams.get("cloud")).toBe("error");
    expect(redirect.searchParams.get("cloudError")).toBe("invalid-query");
  });

  it("passes only validated scalar callback values to the connection service", async () => {
    const completeConnection = vi.fn().mockResolvedValue({
      returnTo: "/studio?view=storage",
      accountLabel: "artist@example.test",
    });
    const controller = new PersonalCloudController({ completeConnection } as unknown as PersonalCloudService);
    const response = responseFixture();
    const cookieName = personalCloudOAuthCookieName();

    await controller.callback(
      "google-drive",
      "authorization-code",
      "signed-state",
      undefined,
      "user-1",
      requestFixture(`${cookieName}=encrypted%2Ecookie`),
      response,
    );

    expect(completeConnection).toHaveBeenCalledExactlyOnceWith({
      provider: "google-drive",
      code: "authorization-code",
      state: "signed-state",
      cookieValue: "encrypted.cookie",
      sessionUserId: "user-1",
    });
    const redirect = new URL(String(vi.mocked(response.redirect).mock.calls[0]?.[0]));
    expect(redirect.pathname).toBe("/studio");
    expect(redirect.searchParams.get("cloud")).toBe("connected");
  });
});
