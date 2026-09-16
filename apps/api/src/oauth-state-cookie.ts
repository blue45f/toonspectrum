import type { CookieOptions } from "express";

import type { OAuthProviderId } from "./server/oauth";

export const OAUTH_STATE_COOKIE_TTL_MS = 10 * 60_000;

export function oauthStateCookieName(provider: OAuthProviderId): string {
  return `toonspectrum-oauth-state-${provider}`;
}

export function oauthPkceVerifierCookieName(provider: OAuthProviderId): string {
  return `toonspectrum-oauth-pkce-${provider}`;
}

function oauthStateCookiePath(provider: OAuthProviderId): string {
  return `/api/auth/oauth/${provider}`;
}

export function resolveOAuthStateCookieOptions(
  provider: OAuthProviderId,
): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: oauthStateCookiePath(provider),
    maxAge: OAUTH_STATE_COOKIE_TTL_MS,
  };
}

export function resolveOAuthStateCookieClearOptions(
  provider: OAuthProviderId,
): CookieOptions {
  return {
    ...resolveOAuthStateCookieOptions(provider),
    maxAge: 0,
  };
}

export function resolveOAuthPkceVerifierCookieOptions(
  provider: OAuthProviderId,
): CookieOptions {
  return resolveOAuthStateCookieOptions(provider);
}

export function resolveOAuthPkceVerifierCookieClearOptions(
  provider: OAuthProviderId,
): CookieOptions {
  return resolveOAuthStateCookieClearOptions(provider);
}

function resolveCookieValue(
  cookieHeader: string | string[] | undefined,
  expectedName: string,
): string | null {
  if (!cookieHeader) return null;
  const merged = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader;

  for (const chunk of merged.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator).trim() !== expectedName) continue;
    const value = trimmed.slice(separator + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveOAuthStateCookieValue(
  cookieHeader: string | string[] | undefined,
  provider: OAuthProviderId,
): string | null {
  return resolveCookieValue(cookieHeader, oauthStateCookieName(provider));
}

export function resolveOAuthPkceVerifierCookieValue(
  cookieHeader: string | string[] | undefined,
  provider: OAuthProviderId,
): string | null {
  return resolveCookieValue(cookieHeader, oauthPkceVerifierCookieName(provider));
}
