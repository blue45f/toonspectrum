import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthController } from "./auth.controller";

import type { Request, Response } from "express";

function controller(): AuthController {
  return new AuthController(
    { distributed: false },
    { mode: "direct" },
    null,
  );
}

function response(): Response {
  return {
    redirect: vi.fn((url: string) => url),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AuthController Google GIS/code-flow boundary", () => {
  it("keeps the retired Toss provider closed across every generic OAuth route", async () => {
    const instance = controller();
    const startResponse = response();
    expect(() => instance.oauthStart("toss", startResponse)).toThrow(
      BadRequestException,
    );
    expect(startResponse.redirect).not.toHaveBeenCalled();

    const callbackResponse = response();
    await instance.oauthCallback(
      "toss",
      "unused-code",
      "unused-state",
      undefined,
      callbackResponse,
    );
    expect(callbackResponse.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/auth/callback#error=unsupported",
    );

    const demoResponse = response();
    await expect(
      instance.oauthDemo(
        "toss",
        {} as Request,
        demoResponse,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(demoResponse.redirect).not.toHaveBeenCalled();
  });

  it("rejects a legacy start before reading OAuth state in a GIS-only production config", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_STATE_SECRET", "");
    const res = response();

    expect(() => controller().oauthStart("google", res)).toThrow(
      ServiceUnavailableException,
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("turns a direct legacy callback into a safe diagnostic without verifying state", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_STATE_SECRET", "");
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const res = response();

    await controller().oauthCallback(
      "google",
      "unused-code",
      "unused-state",
      undefined,
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=oauth_unavailable",
    );
  });
});
