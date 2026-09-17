#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "https://www.toonstudio.cloud";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAXIMUM_RESPONSE_BYTES = 32_768;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const REDIRECT_PROVIDERS = Object.freeze({
  kakao: Object.freeze({
    hostname: "kauth.kakao.com",
    pathname: "/oauth/authorize",
  }),
  naver: Object.freeze({
    hostname: "nid.naver.com",
    pathname: "/oauth2.0/authorize",
  }),
  github: Object.freeze({
    hostname: "github.com",
    pathname: "/login/oauth/authorize",
  }),
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSocialLoginOrigin(raw = DEFAULT_ORIGIN) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("production origin must be a non-empty HTTPS origin");
  }

  let origin;
  try {
    origin = new URL(raw.trim());
  } catch {
    throw new Error("production origin must be an absolute HTTPS origin");
  }

  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) {
    throw new Error(
      "production origin must be HTTPS without credentials, path, query, or fragment",
    );
  }

  return origin;
}

async function readBoundedJson(response, label) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAXIMUM_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeds ${MAXIMUM_RESPONSE_BYTES} bytes`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} response is not valid JSON`);
  }
}

function assertNoSensitiveFields(provider, value) {
  for (const key of Object.keys(value)) {
    if (/(?:secret|access.?token|refresh.?token|authorization.?code)/iu.test(key)) {
      throw new Error(`${provider} discovery exposes a sensitive field: ${key}`);
    }
  }
}

export function validateSocialLoginDiscovery(payload) {
  if (!isRecord(payload)) throw new Error("provider discovery must be an object");

  const expected = ["google", "kakao", "naver", "github"];
  const result = {};

  for (const provider of expected) {
    const value = payload[provider];
    if (!isRecord(value)) throw new Error(`${provider} is missing from provider discovery`);
    assertNoSensitiveFields(provider, value);

    if (value.mode !== "oauth") {
      throw new Error(`${provider}.mode must be oauth; received ${String(value.mode)}`);
    }
    if (typeof value.label !== "string" || value.label.trim() === "") {
      throw new Error(`${provider}.label must be a non-empty string`);
    }
    if ("reason" in value) {
      throw new Error(`${provider} must not include a disabled reason in production`);
    }

    if (provider === "google") {
      if (
        typeof value.clientId !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.apps\.googleusercontent\.com$/u.test(value.clientId)
      ) {
        throw new Error("google.clientId is missing or malformed");
      }
      if (typeof value.redirectAvailable !== "boolean") {
        throw new Error("google.redirectAvailable must be a boolean");
      }
    } else {
      if (value.redirectAvailable !== true) {
        throw new Error(`${provider}.redirectAvailable must be true`);
      }
      if ("clientId" in value) {
        throw new Error(`${provider} discovery must not expose clientId`);
      }
    }

    result[provider] = Object.freeze({
      label: value.label,
      mode: value.mode,
      redirectAvailable: value.redirectAvailable,
    });
  }

  return Object.freeze(result);
}

function requireCookieAttributes(setCookie, provider, cookieName) {
  const lower = setCookie.toLowerCase();
  if (!lower.includes(`${cookieName.toLowerCase()}=`)) {
    throw new Error(`${provider} start response is missing ${cookieName}`);
  }
  for (const attribute of ["httponly", "secure", "samesite=lax"]) {
    if (!lower.includes(attribute)) {
      throw new Error(`${provider} state cookie is missing ${attribute}`);
    }
  }
  if (!lower.includes(`path=/api/auth/oauth/${provider}`)) {
    throw new Error(`${provider} state cookie has an unexpected path`);
  }
}

function validateProviderSpecificAuthorizeUrl(provider, location) {
  if (provider === "kakao") {
    const scope = new Set((location.searchParams.get("scope") ?? "").split(","));
    if (!scope.has("profile_nickname") || !scope.has("profile_image")) {
      throw new Error("kakao authorize scope is missing the minimum profile scopes");
    }
    if (scope.has("account_email")) {
      throw new Error("kakao authorize scope requests account_email without approval");
    }
    return;
  }

  if (provider === "naver") {
    if (location.searchParams.has("scope")) {
      throw new Error("naver authorize URL must rely on console-configured consent fields");
    }
    return;
  }

  if (location.searchParams.get("scope") !== "user:email") {
    throw new Error("github authorize scope must be user:email");
  }
  if (location.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("github authorize URL must use S256 PKCE");
  }
  const challenge = location.searchParams.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/u.test(challenge)) {
    throw new Error("github authorize URL has an invalid PKCE challenge");
  }
}

async function verifyRedirectProvider(fetchImpl, origin, provider, timeoutMs) {
  const expected = REDIRECT_PROVIDERS[provider];
  const path = `/api/auth/oauth/${provider}/start`;
  const response = await fetchImpl(new URL(path, origin), {
    method: "GET",
    redirect: "manual",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache",
      "user-agent": "toonstudio-social-login-verifier/1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!REDIRECT_STATUSES.has(response.status)) {
    throw new Error(`${path} returned ${response.status}; expected an OAuth redirect`);
  }

  const rawLocation = response.headers.get("location");
  if (!rawLocation) throw new Error(`${path} is missing a Location header`);

  let location;
  try {
    location = new URL(rawLocation);
  } catch {
    throw new Error(`${path} returned an invalid Location header`);
  }

  if (
    location.protocol !== "https:"
    || location.hostname !== expected.hostname
    || location.pathname !== expected.pathname
  ) {
    throw new Error(`${provider} redirects to an unexpected authorization endpoint`);
  }
  if (!location.searchParams.get("client_id")) {
    throw new Error(`${provider} authorize URL is missing client_id`);
  }
  if (location.searchParams.get("response_type") !== "code") {
    throw new Error(`${provider} authorize URL must request an authorization code`);
  }
  if (!location.searchParams.get("state")) {
    throw new Error(`${provider} authorize URL is missing state`);
  }

  const expectedCallback = new URL(`/api/auth/oauth/${provider}/callback`, origin).toString();
  if (location.searchParams.get("redirect_uri") !== expectedCallback) {
    throw new Error(`${provider} authorize URL has an unexpected redirect_uri`);
  }

  validateProviderSpecificAuthorizeUrl(provider, location);

  const setCookie = response.headers.get("set-cookie") ?? "";
  requireCookieAttributes(
    setCookie,
    provider,
    `toonspectrum-oauth-state-${provider}`,
  );
  if (provider === "github") {
    requireCookieAttributes(
      setCookie,
      provider,
      "toonspectrum-oauth-pkce-github",
    );
  }

  return Object.freeze({
    provider,
    status: response.status,
    authorizationHost: location.hostname,
  });
}

export async function verifySocialLoginProduction({
  origin = DEFAULT_ORIGIN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const parsed = origin instanceof URL ? origin : parseSocialLoginOrigin(origin);
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("timeoutMs must be an integer between 1000 and 120000");
  }

  const discoveryPath = "/api/auth/providers";
  const discoveryResponse = await fetchImpl(new URL(discoveryPath, parsed), {
    method: "GET",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
      "user-agent": "toonstudio-social-login-verifier/1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (discoveryResponse.status >= 300 && discoveryResponse.status < 400) {
    throw new Error(`${discoveryPath} must not redirect`);
  }
  if (discoveryResponse.status !== 200) {
    throw new Error(`${discoveryPath} returned ${discoveryResponse.status}; expected 200`);
  }
  if (!(discoveryResponse.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error(`${discoveryPath} must return application/json`);
  }

  const discovery = validateSocialLoginDiscovery(
    await readBoundedJson(discoveryResponse, discoveryPath),
  );

  const redirects = [];
  for (const provider of Object.keys(REDIRECT_PROVIDERS)) {
    redirects.push(await verifyRedirectProvider(
      fetchImpl,
      parsed,
      provider,
      timeoutMs,
    ));
  }

  return Object.freeze({
    origin: parsed.origin,
    discovery,
    redirects: Object.freeze(redirects),
  });
}

async function main() {
  const originArgument = process.argv.find((argument) => argument.startsWith("--origin="));
  const timeoutArgument = process.argv.find((argument) => argument.startsWith("--timeout-ms="));
  const timeoutMs = timeoutArgument
    ? Number(timeoutArgument.slice("--timeout-ms=".length))
    : DEFAULT_TIMEOUT_MS;
  const result = await verifySocialLoginProduction({
    origin: originArgument?.slice("--origin=".length) ?? DEFAULT_ORIGIN,
    timeoutMs,
  });
  const providers = Object.keys(result.discovery).join(", ");
  const redirects = result.redirects
    .map(({ provider, status, authorizationHost }) => `${provider}=${status}@${authorizationHost}`)
    .join(", ");
  console.log(`Social login production verified: ${result.origin} (${providers}; ${redirects})`);
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
