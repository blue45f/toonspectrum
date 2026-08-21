import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueState } from "../../server/oauth";
import { verifySessionToken } from "../../server/session";
import { AUTH_SESSION_COOKIE_NAME } from "../../session-cookie";

import { AuthController } from "./auth.controller";

import type { Request, Response } from "express";

const handleGoogleIdToken = vi.hoisted(() => vi.fn());
const handleOAuthCallback = vi.hoisted(() => vi.fn());

vi.mock("../../server/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/oauth")>()),
  handleGoogleIdToken,
  handleOAuthCallback,
}));

function controller(): AuthController {
  return new AuthController(
    { distributed: false },
    { mode: "direct" },
    null,
  );
}

function response(): Response {
  return {
    cookie: vi.fn(),
    redirect: vi.fn((url: string) => url),
  } as unknown as Response;
}

function request(): Request {
  return {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
}

beforeEach(() => {
  handleGoogleIdToken.mockReset();
  handleOAuthCallback.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("issues the signed HttpOnly session in the callback response without a process-local handoff token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "configured-code-flow-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv(
      "AUTH_SESSION_SECRET",
      "abcdef0123456789abcdef0123456789",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("google");
    handleOAuthCallback.mockResolvedValueOnce({
      id: "google-user-1",
      name: "Google User",
      email: "artist@example.test",
      image: null,
      role: "user",
      sessionVersion: 7,
    });
    const res = response();

    await controller().oauthCallback(
      "google",
      "valid-authorization-code",
      state,
      undefined,
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      }),
    );
    const sessionToken = vi.mocked(res.cookie).mock.calls[0]?.[1];
    expect(verifySessionToken(String(sessionToken))).toMatchObject({
      userId: "google-user-1",
      sessionVersion: 7,
    });
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#session=1",
    );
    const redirectUrl = String(vi.mocked(res.redirect).mock.calls[0]?.[0]);
    expect(redirectUrl).not.toContain("artist@example.test");
    expect(redirectUrl).not.toContain(String(sessionToken));
    expect(redirectUrl).not.toContain("#t=");
  });

  it("logs a stable redirect failure reason without the OAuth code, state, PII, or upstream message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "configured-code-flow-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("google");
    const authorizationCode = "oauth-code-never-log-this";
    const upstreamMessage =
      "token exchange failed for private.artist@example.test with refresh-token-never-log-this";
    handleOAuthCallback.mockRejectedValueOnce(new Error(upstreamMessage));
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const res = response();

    await controller().oauthCallback(
      "google",
      authorizationCode,
      state,
      undefined,
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=oauth_failed",
    );
    expect(logger).toHaveBeenCalledExactlyOnceWith({
      event: "auth.oauth.failure",
      flow: "authorization-code",
      provider: "google",
      reasonCode: "authorization-code-processing-failed",
    });
    const serializedLogs = JSON.stringify(logger.mock.calls);
    expect(serializedLogs).not.toContain(authorizationCode);
    expect(serializedLogs).not.toContain(state);
    expect(serializedLogs).not.toContain("private.artist@example.test");
    expect(serializedLogs).not.toContain("refresh-token-never-log-this");
    expect(serializedLogs).not.toContain(upstreamMessage);
  });

  it("logs only the stable GIS persistence reason for an unknown failure", async () => {
    const idToken = "header.id-token-never-log-this.signature";
    const internalMessage =
      "postgresql://runtime:db-secret@example.invalid/internal private.artist@example.test";
    handleGoogleIdToken.mockRejectedValueOnce(new Error(internalMessage));
    const logger = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const res = { cookie: vi.fn() } as unknown as Response;

    const error = await controller()
      .oauthGoogleIdToken(
        { idToken },
        "https://www.toonstudio.cloud",
        request(),
        res,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(logger).toHaveBeenCalledExactlyOnceWith({
      event: "auth.oauth.failure",
      flow: "google-id-token",
      provider: "google",
      reasonCode: "google-id-token-persistence-failed",
    });
    const serializedLogs = JSON.stringify(logger.mock.calls);
    expect(serializedLogs).not.toContain(idToken);
    expect(serializedLogs).not.toContain("db-secret");
    expect(serializedLogs).not.toContain("private.artist@example.test");
    expect(serializedLogs).not.toContain(internalMessage);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
