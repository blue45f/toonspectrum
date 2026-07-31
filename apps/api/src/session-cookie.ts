import { SESSION_TOKEN_TTL_MS } from "../../../lib/server/session";

import type { CookieOptions } from "express";

const AUTH_SESSION_COOKIE_NAME = "toonspectrum-auth-session";

export { AUTH_SESSION_COOKIE_NAME };

function isSecureCookieEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

export function resolveSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookieEnabled(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TOKEN_TTL_MS,
  };
}

export function resolveSessionCookieClearOptions(): CookieOptions {
  return {
    ...resolveSessionCookieOptions(),
    maxAge: 0,
  };
}

export function resolveSessionCookieValue(
  cookieHeader: string | string[] | undefined,
): string | null {
  if (!cookieHeader) return null;
  const merged = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader;
  const chunks = merged.split(";");
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    if (name !== AUTH_SESSION_COOKIE_NAME) continue;
    return trimmed.slice(separator + 1);
  }
  return null;
}
