import { ServiceUnavailableException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_COOKIE_NAME } from "../../session-cookie";

import { resolveAuthSessionUser } from "./auth-session-profile";
import { AuthController, authResponseUser } from "./auth.controller";
import { AuthSessionResponseSchema } from "./auth.dto";

import type { Response } from "express";

const revokeUserSessions = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/server/user-lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../lib/server/user-lifecycle")>()),
  revokeUserSessions,
}));

vi.mock("./auth-session-profile", () => ({
  resolveAuthSessionUser: vi.fn(),
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
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe("AuthController session truth source", () => {
  beforeEach(() => {
    vi.mocked(resolveAuthSessionUser).mockReset();
    revokeUserSessions.mockReset();
    revokeUserSessions.mockResolvedValue({ ok: true, sessionVersion: 2 });
  });

  it("returns an explicit logged-out response and expires a stale cookie", async () => {
    const res = response();

    const result = await controller().getSession(undefined, res);

    expect(AuthSessionResponseSchema.parse(result)).toEqual({
      authenticated: false,
      user: null,
    });
    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      }),
    );
    expect(resolveAuthSessionUser).not.toHaveBeenCalled();
  });

  it("hydrates only the public user projection for a verified session id", async () => {
    const res = response();
    vi.mocked(resolveAuthSessionUser).mockResolvedValueOnce({
      id: "verified-user",
      name: "웹툰 독자",
      email: "reader@example.com",
      image: null,
      role: "creator",
    });

    const result = await controller().getSession("verified-user", res);

    expect(AuthSessionResponseSchema.parse(result)).toEqual({
      authenticated: true,
      user: {
        id: "verified-user",
        name: "웹툰 독자",
        email: "reader@example.com",
        image: null,
        role: "creator",
      },
    });
    expect(JSON.stringify(result)).not.toContain("token");
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it("turns a deleted or missing profile race into logged-out state", async () => {
    const res = response();
    vi.mocked(resolveAuthSessionUser).mockResolvedValueOnce(null);

    await expect(controller().getSession("removed-user", res)).resolves.toEqual({
      authenticated: false,
      user: null,
    });
    expect(res.clearCookie).toHaveBeenCalledOnce();
  });

  it("expires the HttpOnly cookie while preserving a 503 when durable revocation fails", async () => {
    const res = response();
    revokeUserSessions.mockRejectedValueOnce(
      new Error("postgresql://user:secret@example.invalid/database"),
    );

    const error = await controller()
      .logout("verified-user", res)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(revokeUserSessions).toHaveBeenCalledWith("verified-user");
    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      }),
    );
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse()))
      .not.toContain("postgresql");
  });

  it("also expires an already-anonymous browser cookie", async () => {
    const res = response();

    await expect(controller().logout(undefined, res)).resolves.toEqual({ ok: true });
    expect(revokeUserSessions).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledOnce();
  });

  it("never exposes bearer or lifecycle internals in an auth completion user", () => {
    const result = authResponseUser({
      id: "cookie-user",
      name: "쿠키 사용자",
      email: "cookie@example.com",
      image: null,
      role: "CREATOR",
      sessionVersion: 7,
      token: "must-not-leave-the-server",
    } as never);

    expect(result).toEqual({
      id: "cookie-user",
      name: "쿠키 사용자",
      email: "cookie@example.com",
      image: null,
      role: "creator",
    });
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("sessionVersion");
  });
});
