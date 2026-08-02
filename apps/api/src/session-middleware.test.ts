import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifySessionToken } from "../../../lib/server/session";
import { isSessionAllowed } from "../../../lib/server/user-lifecycle";

import { AUTH_SESSION_COOKIE_NAME, resolveSessionCookieValue } from "./session-cookie";
import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
  sessionAuth,
} from "./session-middleware";


vi.mock("../../../lib/server/session", () => ({
  verifySessionToken: vi.fn(),
}));

vi.mock("../../../lib/server/user-lifecycle", () => ({
  isSessionAllowed: vi.fn(),
}));

describe("session middleware", () => {
  const nextTick = async () =>
    new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.mocked(verifySessionToken).mockReset();
    vi.mocked(isSessionAllowed).mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses valid x-user-id token first", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "header-user",
      sessionVersion: 1,
      expiresAt: Date.now() + 1_000,
    });
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = { headers: { "x-user-id": "raw-token" } } as never;
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("header-user");
    expect(getSessionAuthenticationSource(req)).toBe("header");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "header-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to auth session cookie when header is absent", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockImplementation((token: unknown) =>
      token === "cookie-token" ? { userId: "cookie-user", sessionVersion: 1, expiresAt: Date.now() + 1_000 } : null
    );
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = {
      headers: {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token`,
      },
    } as never;
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("cookie-user");
    expect(getSessionAuthenticationSource(req)).toBe("cookie");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "cookie-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("clears auth header when neither header nor cookie are valid", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue(null);
    vi.mocked(isSessionAllowed).mockResolvedValue(false);

    const req = { headers: {} } as never;
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers).toEqual({});
    expect(getSessionAuthenticationSource(req)).toBeNull();
    expect(getSessionAuthenticationPrincipal(req)).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("propagates lifecycle dependency failures instead of logging the user out", async () => {
    const next = vi.fn();
    const dependencyError = new Error("database unavailable");
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "existing-user",
      sessionVersion: 1,
      expiresAt: Date.now() + 1_000,
    });
    vi.mocked(isSessionAllowed).mockRejectedValue(dependencyError);

    const req = { headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token` } } as never;
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBeUndefined();
    expect(getSessionAuthenticationSource(req)).toBeNull();
    expect(getSessionAuthenticationPrincipal(req)).toBeNull();
    expect(next).toHaveBeenCalledWith(dependencyError);
  });

  it("falls back to a valid cookie and records cookie auth after an invalid header", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockImplementation((token: unknown) =>
      token === "cookie-token"
        ? {
            userId: "cookie-user",
            sessionVersion: 1,
            expiresAt: Date.now() + 1_000,
          }
        : null,
    );
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = {
      headers: {
        "x-user-id": "invalid-header-token",
        cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token`,
      },
    } as never;
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("cookie-user");
    expect(getSessionAuthenticationSource(req)).toBe("cookie");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "cookie-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("session cookie parser export parity", () => {
  it("returns configured auth cookie when present", () => {
    expect(resolveSessionCookieValue("a=1; b=2")).toBeNull();
    expect(resolveSessionCookieValue(`${AUTH_SESSION_COOKIE_NAME}=v`)).toBe("v");
  });
});
