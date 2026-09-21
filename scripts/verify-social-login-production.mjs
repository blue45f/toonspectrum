#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ORIGIN = "https://www.toonstudio.cloud";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAXIMUM_RESPONSE_BYTES = 32_768;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const REDIRECT_PROVIDERS = Object.freeze({
  apple: Object.freeze({
    hostname: "appleid.apple.com",
    pathname: "/auth/authorize",
  }),
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

export function validateSocialLoginDiscovery(payload, { allowDisabled = [] } = {}) {
  if (!isRecord(payload)) throw new Error("provider discovery must be an object");

  const expected = ["google", "apple", "kakao", "naver", "github"];
  if (!Array.isArray(allowDisabled) || allowDisabled.some((id) => !expected.includes(id))) {
    throw new Error("allowDisabled must contain known provider IDs only");
  }
  const result = {};

  for (const provider of expected) {
    const value = payload[provider];
    if (!isRecord(value)) throw new Error(`${provider} is missing from provider discovery`);
    assertNoSensitiveFields(provider, value);

    if (value.mode === "disabled" && allowDisabled.includes(provider)) {
      if (value.redirectAvailable !== false || "clientId" in value
        || typeof value.label !== "string" || !value.label.trim()
        || !["missing-client-id", "missing-credentials"].includes(value.reason)) {
        throw new Error(`${provider} has an invalid disabled configuration`);
      }
      result[provider] = Object.freeze({
        label: value.label, mode: "disabled", redirectAvailable: false, reason: value.reason,
      });
      continue;
    }
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
  const sameSite = provider === "apple" ? "samesite=none" : "samesite=lax";
  for (const attribute of ["httponly", "secure", sameSite]) {
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

  if (provider === "apple") {
    const scope = new Set((location.searchParams.get("scope") ?? "").split(/\s+/u));
    if (!scope.has("name") || !scope.has("email")) {
      throw new Error("apple authorize scope must request name and email");
    }
    if (location.searchParams.get("response_mode") !== "form_post") {
      throw new Error("apple authorize URL must use form_post");
    }
    if (!/^[A-Za-z0-9_-]{43}$/u.test(location.searchParams.get("nonce") ?? "")) {
      throw new Error("apple authorize URL has an invalid nonce");
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

/** Public, cookie-free entry probe only: never follows an application callback. */
export async function probeGoogleAuthorizationClient({
  clientId, origin = DEFAULT_ORIGIN, fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const parsed = parseSocialLoginOrigin(String(origin));
  if (typeof clientId !== "string" || clientId.length > 512
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.apps\.googleusercontent\.com$/u.test(clientId)) {
    throw new Error("google.clientId is missing or malformed");
  }
  const callback = new URL("/api/auth/oauth/google/callback", parsed);
  let target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({
    client_id: clientId, redirect_uri: callback.href, response_type: "code",
    scope: "openid email profile", prompt: "none", state: randomBytes(24).toString("base64url"),
  }).toString();
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetchImpl(target, {
      method: "GET", redirect: "manual", credentials: "omit",
      headers: { accept: "text/html", "user-agent": "toonstudio-social-login-verifier/2" },
      signal,
    });
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!REDIRECT_STATUSES.has(response.status)) {
      if (response.status !== 200) throw new Error(`google entry probe returned ${response.status}`);
      return Object.freeze({ stage: "authorization-page", authenticated: false });
    }
    if (!location || location.length > 16_384) throw new Error("google entry probe has an invalid redirect");
    const next = new URL(location, target);
    if (next.protocol !== "https:" || next.username || next.password || next.port) {
      throw new Error("google entry probe has an unsafe redirect");
    }
    if (next.origin !== "https://accounts.google.com" && next.origin !== parsed.origin) {
      throw new Error("google entry probe redirected to an unexpected host");
    }
    const encoded = next.searchParams.get("authError") ?? "";
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const error = next.searchParams.get("error") ?? "";
    const knownError = `${error} ${payload}`.match(
      /\b(deleted_client|invalid_client|redirect_uri_mismatch|unauthorized_client|access_denied|invalid_request)\b/u,
    )?.[1];
    if (knownError) throw new Error(`google authorization rejected: ${knownError}`);
    if (next.pathname.includes("/oauth/error")) throw new Error("google authorization rejected: provider_error");
    if (next.origin === parsed.origin) {
      if (next.pathname !== callback.pathname) throw new Error("google entry probe has an unexpected callback");
      if (!["login_required", "interaction_required", "consent_required", "account_selection_required"].includes(error)) {
        throw new Error("google entry probe returned an unexpected callback result");
      }
      return Object.freeze({ stage: "interaction-required", authenticated: false });
    }
    target = next;
  }
  throw new Error("google entry probe exceeded its redirect limit");
}

export async function verifySocialLoginProduction({
  origin = DEFAULT_ORIGIN,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowDisabled = [],
  probeGoogleClient = false,
} = {}) {
  const parsed = parseSocialLoginOrigin(String(origin));
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

  const payload = await readBoundedJson(discoveryResponse, discoveryPath);
  const discovery = validateSocialLoginDiscovery(payload, { allowDisabled });
  const googlePreflight = probeGoogleClient && discovery.google.mode === "oauth"
    ? await probeGoogleAuthorizationClient({
        clientId: payload.google.clientId, origin: parsed.origin, fetchImpl, timeoutMs,
      })
    : null;

  const redirects = [];
  for (const provider of Object.keys(REDIRECT_PROVIDERS)) {
    if (discovery[provider].mode === "disabled") continue;
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
    googlePreflight,
    redirects: Object.freeze(redirects),
  });
}

async function main() {
  const originArgument = process.argv.find((argument) => argument.startsWith("--origin="));
  const timeoutArgument = process.argv.find((argument) => argument.startsWith("--timeout-ms="));
  const disabledArgument = process.argv.find((argument) => argument.startsWith("--allow-disabled="));
  const timeoutMs = timeoutArgument
    ? Number(timeoutArgument.slice("--timeout-ms=".length))
    : DEFAULT_TIMEOUT_MS;
  const result = await verifySocialLoginProduction({
    origin: originArgument?.slice("--origin=".length) ?? DEFAULT_ORIGIN,
    timeoutMs,
    allowDisabled: disabledArgument?.slice("--allow-disabled=".length).split(",") ?? [],
    probeGoogleClient: process.argv.includes("--probe-google-client"),
  });
  const providers = Object.entries(result.discovery).map(([id, value]) => `${id}=${value.mode}`).join(", ");
  const redirects = result.redirects
    .map(({ provider, status, authorizationHost }) => `${provider}=${status}@${authorizationHost}`)
    .join(", ");
  console.log(`Social login entry points verified (not a completed sign-in): ${result.origin} (${providers}; ${redirects})`);
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
