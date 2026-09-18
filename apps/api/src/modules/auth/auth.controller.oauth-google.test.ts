import { generateKeyPairSync } from "node:crypto";

import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  oauthLinkSessionCookieName,
  oauthPkceVerifierCookieName,
  oauthStateCookieName,
  resolveOAuthLinkSessionCookieOptions,
  resolveOAuthPkceVerifierCookieOptions,
  resolveOAuthStateCookieOptions,
} from "../../oauth-state-cookie";
import {
  appleNonceForState,
  createPkceCodeChallenge,
  issuePkceVerifier,
  issueState,
  readOAuthStateContext,
  verifyBrowserBoundState,
} from "../../server/oauth";
import { signSession, verifySessionToken } from "../../server/session";
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
    clearCookie: vi.fn(),
    redirect: vi.fn((url: string) => url),
  } as unknown as Response;
}

function request(cookie?: string): Request {
  return {
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
}

function requestWithOAuthState(
  provider: "google" | "apple" | "kakao" | "naver" | "github",
  state: string,
  pkceVerifier?: string,
): Request {
  const cookies = [
    `${oauthStateCookieName(provider)}=${encodeURIComponent(state)}`,
  ];
  if (pkceVerifier) {
    cookies.push(
      `${oauthPkceVerifierCookieName(provider)}=${encodeURIComponent(pkceVerifier)}`,
    );
  }
  return request(cookies.join("; "));
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
      request(),
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

  it("keeps browser-bound OAuth secrets HttpOnly and Secure outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveOAuthStateCookieOptions("github")).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/auth/oauth/github",
      }),
    );
    expect(resolveOAuthPkceVerifierCookieOptions("github")).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/auth/oauth/github",
      }),
    );
  });

  it("uses SameSite=None only for Apple cross-site form_post state", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    vi.stubEnv("APPLE_SERVICE_ID", "cloud.toonstudio.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAMID1234");
    vi.stubEnv("APPLE_KEY_ID", "KEYID12345");
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("AUTH_STATE_SECRET", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");
    const res = response();

    controller().oauthStart("apple", res);

    const redirectUrl = String(vi.mocked(res.redirect).mock.calls[0]?.[0]);
    const authorizeUrl = new URL(redirectUrl);
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(authorizeUrl.searchParams.get("response_mode")).toBe("form_post");
    expect(authorizeUrl.searchParams.get("scope")).toBe("name email");
    expect(authorizeUrl.searchParams.get("nonce")).toBe(appleNonceForState(String(state)));
    expect(res.cookie).toHaveBeenCalledWith(
      oauthStateCookieName("apple"),
      state,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/api/auth/oauth/apple",
      }),
    );
    expect(resolveOAuthLinkSessionCookieOptions("apple")).toEqual(
      expect.objectContaining({ sameSite: "none", secure: true }),
    );
    expect(oauthLinkSessionCookieName("apple")).toBe(
      "toonspectrum-oauth-link-session-apple",
    );
  });

  it("accepts Apple form_post callback and forwards first-authorization name payload", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    vi.stubEnv("APPLE_SERVICE_ID", "cloud.toonstudio.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAMID1234");
    vi.stubEnv("APPLE_KEY_ID", "KEYID12345");
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("AUTH_STATE_SECRET", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("AUTH_SESSION_SECRET", "abcdef0123456789abcdef0123456789");
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("apple");
    const appleUser = JSON.stringify({ name: { firstName: "Apple", lastName: "Creator" } });
    handleOAuthCallback.mockResolvedValueOnce({
      id: "apple-user-1",
      name: "Apple Creator",
      email: "relay@privaterelay.appleid.com",
      image: null,
      role: "user",
      sessionVersion: 2,
    });
    const res = response();

    await controller().oauthAppleCallback(
      { code: "apple-code", state, user: appleUser },
      requestWithOAuthState("apple", state),
      res,
    );

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      "apple",
      "apple-code",
      state,
      undefined,
      { appleUser },
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#session=1",
    );
  });

  it("binds a GitHub redirect start to provider-scoped HttpOnly state and PKCE cookies", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");
    const res = response();

    controller().oauthStart("github", res);

    const redirectUrl = String(vi.mocked(res.redirect).mock.calls[0]?.[0]);
    const authorizeUrl = new URL(redirectUrl);
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(res.cookie).toHaveBeenCalledWith(
      oauthStateCookieName("github"),
      state,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/api/auth/oauth/github",
        maxAge: 10 * 60_000,
      }),
    );
    const pkceCall = vi.mocked(res.cookie).mock.calls.find(
      ([name]) => name === oauthPkceVerifierCookieName("github"),
    );
    const verifier = String(pkceCall?.[1] ?? "");
    expect(verifier).toHaveLength(64);
    expect(pkceCall?.[2]).toEqual(expect.objectContaining({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/oauth/github",
      maxAge: 10 * 60_000,
    }));
    expect(authorizeUrl.searchParams.get("code_challenge")).toBe(
      createPkceCodeChallenge(verifier),
    );
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("keeps OAuth state and PKCE cookies Secure on localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "http://localhost:4001");
    const res = response();

    controller().oauthStart("github", res);

    const oauthCookies = vi.mocked(res.cookie).mock.calls.filter(
      ([name]) => String(name).startsWith("toonspectrum-oauth-"),
    );
    expect(oauthCookies).toHaveLength(2);
    for (const [, , options] of oauthCookies) {
      expect(options).toEqual(expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      }));
    }
  });

  it("rejects a GitHub callback whose browser lost the PKCE verifier", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("github");
    const res = response();

    await controller().oauthCallback(
      "github",
      "authorization-code",
      state,
      undefined,
      requestWithOAuthState("github", state),
      res,
    );

    expect(handleOAuthCallback).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(
      oauthPkceVerifierCookieName("github"),
      expect.objectContaining({ path: "/api/auth/oauth/github", maxAge: 0 }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=bad_state",
    );
  });

  it("forwards the browser-bound PKCE verifier to the GitHub token exchange", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv(
      "AUTH_SESSION_SECRET",
      "abcdef0123456789abcdef0123456789",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("github");
    const verifier = issuePkceVerifier();
    handleOAuthCallback.mockResolvedValueOnce({
      id: "github-user-1",
      name: "GitHub User",
      email: "artist@example.test",
      image: null,
      role: "user",
      sessionVersion: 3,
    });
    const res = response();

    await controller().oauthCallback(
      "github",
      "valid-authorization-code",
      state,
      undefined,
      requestWithOAuthState("github", state, verifier),
      res,
    );

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      "github",
      "valid-authorization-code",
      state,
      verifier,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#session=1",
    );
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
      request(),
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=oauth_unavailable",
    );
  });

  it("rejects polluted or oversized OAuth callback query parameters", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "configured-code-flow-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("google");

    expect(readOAuthStateContext("google", [state])).toBeNull();
    expect(readOAuthStateContext("google", { state })).toBeNull();
    expect(verifyBrowserBoundState("google", state, [state])).toBe(false);
    expect(verifyBrowserBoundState("google", state, `${state}x`)).toBe(false);

    const cases: ReadonlyArray<{
      readonly code: unknown;
      readonly callbackState: unknown;
      readonly error: unknown;
      readonly expected: string;
    }> = [
      {
        code: "authorization-code",
        callbackState: [state],
        error: undefined,
        expected: "https://www.toonstudio.cloud/auth/callback#error=bad_state",
      },
      {
        code: ["authorization-code"],
        callbackState: state,
        error: undefined,
        expected: "https://www.toonstudio.cloud/auth/callback#error=no_code",
      },
      {
        code: "x".repeat(8_193),
        callbackState: state,
        error: undefined,
        expected: "https://www.toonstudio.cloud/auth/callback#error=no_code",
      },
      {
        code: "authorization-code",
        callbackState: state,
        error: ["access_denied"],
        expected: "https://www.toonstudio.cloud/auth/callback#error=provider_error",
      },
    ];

    for (const current of cases) {
      const res = response();
      await controller().oauthCallback(
        "google",
        current.code,
        current.callbackState,
        current.error,
        requestWithOAuthState("google", state),
        res,
      );
      expect(res.redirect).toHaveBeenCalledWith(current.expected);
    }
    expect(handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a valid signed state that was not initiated by the callback browser", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "configured-code-flow-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("google");
    const res = response();

    await controller().oauthCallback(
      "google",
      "valid-but-cross-browser-code",
      state,
      undefined,
      request(),
      res,
    );

    expect(handleOAuthCallback).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=bad_state",
    );
  });

  it("does not let a stale callback erase a newer browser-bound Naver flow", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NAVER_OAUTH_CLIENT_ID", "naver-client-id");
    vi.stubEnv("NAVER_OAUTH_CLIENT_SECRET", "naver-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const staleState = issueState("naver");
    const currentState = issueState("naver");
    const res = response();

    await controller().oauthCallback(
      "naver",
      "stale-authorization-code",
      staleState,
      undefined,
      requestWithOAuthState("naver", currentState),
      res,
    );

    expect(handleOAuthCallback).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=bad_state",
    );
  });

  it("recovers a repeated Naver callback when the first callback already issued a valid session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NAVER_OAUTH_CLIENT_ID", "naver-client-id");
    vi.stubEnv("NAVER_OAUTH_CLIENT_SECRET", "naver-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv(
      "AUTH_SESSION_SECRET",
      "abcdef0123456789abcdef0123456789",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("naver");
    const session = signSession("naver-user-1", 3);
    const res = response();

    await controller().oauthCallback(
      "naver",
      "already-consumed-authorization-code",
      state,
      undefined,
      request(`${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(session)}`),
      res,
    );

    expect(handleOAuthCallback).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#session=1",
    );
  });

  it("does not mask a Naver provider rejection as a recovered duplicate callback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NAVER_OAUTH_CLIENT_ID", "naver-client-id");
    vi.stubEnv("NAVER_OAUTH_CLIENT_SECRET", "naver-client-secret");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "0123456789abcdef0123456789abcdef",
    );
    vi.stubEnv(
      "AUTH_SESSION_SECRET",
      "abcdef0123456789abcdef0123456789",
    );
    vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
    const state = issueState("naver");
    const session = signSession("naver-user-1", 3);
    const res = response();

    await controller().oauthCallback(
      "naver",
      undefined,
      state,
      "access_denied",
      request(`${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(session)}`),
      res,
    );

    expect(handleOAuthCallback).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      "https://www.toonstudio.cloud/auth/callback#error=bad_state",
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
      requestWithOAuthState("google", state),
      res,
    );

    expect(handleOAuthCallback).toHaveBeenCalledWith(
      "google",
      "valid-authorization-code",
      state,
      undefined,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      oauthStateCookieName("google"),
      expect.objectContaining({ path: "/api/auth/oauth/google", maxAge: 0 }),
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
      requestWithOAuthState("google", state),
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
      // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic log-redaction fixture
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
