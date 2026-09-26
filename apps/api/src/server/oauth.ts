import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign as signPayload,
  timingSafeEqual,
  verify as verifyPayload,
} from "node:crypto";

import { and, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";

import { accounts, db, dbClient, users } from "../platform/database";

import { normalizePersistedAuthRole } from "./admin-roles";
import { ensureUserLifecycleSchema, getUserAuthBlock, normalizeSessionVersion } from "./user-lifecycle";

// ── 소셜 로그인(Google·Apple·Kakao·Naver·GitHub) ──
// Google: GIS(Google Identity Services) ID 토큰 흐름. 프론트가 받은 ID 토큰을 google-auth-library
//   verifyIdToken 으로 서버 검증(서명·aud·iss·exp)해 신원을 확정한다(인가-코드 교환 불필요).
//   하위 호환: 기존 인가-코드 콜백 경로(handleOAuthCallback)도 키 설정 시 그대로 동작한다.
// Apple: Services ID authorization-code/form_post 흐름. 서버가 ES256 client-secret을 생성하고 Apple ID token을 JWKS로 검증한다.
// Kakao·Naver·GitHub: 서버가 인가 코드를 교환하고 제공자 프로필을 검증하는 OAuth 2.0 흐름.
//   Kakao·Naver는 관리자 데모 토글을 유지하고, GitHub는 S256 PKCE를 사용한다.
// 세션은 서명 JWT(./session.ts)로 발급되어 HttpOnly 쿠키에 저장된다.
// 마이그레이션 중인 탭 전용 클라이언트는 같은 JWT를 x-user-id 헤더로도 보낼 수 있다.

export type OAuthProviderId = "google" | "apple" | "kakao" | "naver" | "github";
export type OAuthProviderMode = "oauth" | "demo" | "disabled";

// OAuth 제공자 프로필 JSON: 키 형태를 고정할 수 없어 unknown 값 레코드로 표현.
// 실제 사용처에서는 asRecord()로 중첩 객체를, str()로 문자열 필드를 안전하게 좁힌다.
type JsonRecord = Record<string, unknown>;

// unknown → 중첩 레코드(객체가 아니면 빈 객체)로 좁히기.
function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : {};
}
// unknown → 문자열 또는 null(문자열이 아니면 null).
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// 소셜 로그인(Google·Apple·Kakao·Naver·GitHub) 실연동 활성화
const DEMO_ONLY_PROVIDERS = new Set<OAuthProviderId>();

export interface OAuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  sessionVersion?: number | null;
}

export class GoogleAuthConfigurationError extends Error {
  constructor() {
    super("google client id not configured");
    this.name = "GoogleAuthConfigurationError";
  }
}

export class GoogleAuthCredentialError extends Error {
  constructor(message = "invalid google credential") {
    super(message);
    this.name = "GoogleAuthCredentialError";
  }
}

export class OAuthAccountBlockedError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage);
    this.name = "OAuthAccountBlockedError";
  }
}

export class OAuthAccountLinkRequiredError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super("an account with this email already exists");
    this.name = "OAuthAccountLinkRequiredError";
  }
}

export class OAuthIdentityAlreadyLinkedError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super("this provider identity is linked to another account");
    this.name = "OAuthIdentityAlreadyLinkedError";
  }
}

export class OAuthProviderAlreadyLinkedError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super("another identity from this provider is already linked");
    this.name = "OAuthProviderAlreadyLinkedError";
  }
}

interface ProviderConfig {
  id: OAuthProviderId;
  label: string;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  emailInfoUrl?: string;
  scope: string;
  demoName: string;
  demoEmail: string;
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function kakaoOAuthScope(): string {
  const scopes = ["profile_nickname", "profile_image"];
  // account_email은 카카오 비즈니스/추가 기능 승인을 받은 앱에서만 요청한다.
  // 권한 없는 앱이 scope를 보내면 전체 로그인 흐름이 거절될 수 있으므로 명시적으로 opt-in한다.
  if (env("KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED") === "true") {
    scopes.push("account_email");
  }
  return scopes.join(",");
}

function providerConfig(id: OAuthProviderId): ProviderConfig {
  if (id === "google") {
    return {
      id,
      label: "Google",
      clientId: env("GOOGLE_OAUTH_CLIENT_ID"),
      clientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
      demoName: "구글 데모 사용자",
      demoEmail: "demo.google@webdex.local",
    };
  }
  if (id === "apple") {
    return {
      id,
      label: "Apple",
      clientId: env("APPLE_SERVICE_ID") ?? env("APPLE_CLIENT_ID"),
      authorizeUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      userInfoUrl: "https://appleid.apple.com/auth/keys",
      scope: "name email",
      demoName: "Apple 사용자",
      demoEmail: "demo.apple@webdex.local",
    };
  }
  if (id === "github") {
    return {
      id,
      label: "GitHub",
      clientId: env("GITHUB_OAUTH_CLIENT_ID"),
      clientSecret: env("GITHUB_OAUTH_CLIENT_SECRET"),
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
      emailInfoUrl: "https://api.github.com/user/emails",
      // Private email lookup only. Public profile fields are available without an extra scope.
      scope: "user:email",
      demoName: "GitHub 데모 사용자",
      demoEmail: "demo.github@webdex.local",
    };
  }
  if (id === "naver") {
    return {
      id,
      label: "네이버",
      clientId: env("NAVER_OAUTH_CLIENT_ID") ?? env("NAVER_CLIENT_ID"),
      clientSecret: env("NAVER_OAUTH_CLIENT_SECRET") ?? env("NAVER_CLIENT_SECRET"),
      authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
      tokenUrl: "https://nid.naver.com/oauth2.0/token",
      userInfoUrl: "https://openapi.naver.com/v1/nid/me",
      scope: "", // 네이버는 scope 파라미터 없이 앱 설정의 동의항목(이메일·닉네임·프로필)을 사용
      demoName: "네이버 데모 사용자",
      demoEmail: "demo.naver@webdex.local",
    };
  }
  return {
    id,
    label: "카카오",
    // 카카오는 REST API 키를 client_id로, 활성화된 클라이언트 시크릿을 client_secret으로 사용.
    clientId: env("KAKAO_REST_API_KEY") ?? env("KAKAO_OAUTH_CLIENT_ID"),
    clientSecret: env("KAKAO_CLIENT_SECRET") ?? env("KAKAO_OAUTH_CLIENT_SECRET"),
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userInfoUrl: "https://kapi.kakao.com/v2/user/me?secure_resource=true",
    scope: kakaoOAuthScope(),
    demoName: "카카오 데모 사용자",
    demoEmail: "demo.kakao@webdex.local",
  };
}

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return (
    value === "google"
    || value === "apple"
    || value === "kakao"
    || value === "naver"
    || value === "github"
  );
}

function socialLoginDemoEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && env("AUTH_SOCIAL_DEMO_ENABLED") === "true";
}

function applePrivateKey(): string | undefined {
  const raw = env("APPLE_PRIVATE_KEY");
  return raw?.replaceAll("\\n", "\n");
}

function appleAuthorizationConfigured(): boolean {
  const clientId = env("APPLE_SERVICE_ID") ?? env("APPLE_CLIENT_ID");
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  const privateKey = applePrivateKey();
  if (
    !clientId
    || !/^[A-Za-z0-9.-]{3,255}$/u.test(clientId)
    || !teamId
    || !/^[A-Z0-9]{10}$/u.test(teamId)
    || !keyId
    || !/^[A-Z0-9]{10}$/u.test(keyId)
    || !privateKey
  ) return false;
  try {
    const key = createPrivateKey(privateKey);
    return key.asymmetricKeyType === "ec"
      && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
  } catch {
    return false;
  }
}

export function appleNonceForState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("base64url");
}

function encodeJwtPart(value: JsonRecord): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createAppleClientSecret(now = Date.now()): string {
  const clientId = env("APPLE_SERVICE_ID") ?? env("APPLE_CLIENT_ID");
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  const privateKey = applePrivateKey();
  if (!clientId || !teamId || !keyId || !privateKey) {
    throw new Error("Apple Sign in is not fully configured");
  }
  const issuedAt = Math.floor(now / 1000);
  const header = encodeJwtPart({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = encodeJwtPart({
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + 5 * 60,
    aud: "https://appleid.apple.com",
    sub: clientId,
  });
  const signingInput = `${header}.${payload}`;
  const signingKey = createPrivateKey(privateKey);
  if (
    signingKey.asymmetricKeyType !== "ec"
    || signingKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("Apple private key must be a P-256 EC key");
  }
  const signature = signPayload(
    "sha256",
    Buffer.from(signingInput, "ascii"),
    {
      key: signingKey,
      dsaEncoding: "ieee-p1363",
    },
  );
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function providerMode(id: OAuthProviderId): OAuthProviderMode {
  if (DEMO_ONLY_PROVIDERS.has(id)) return "demo";
  const c = providerConfig(id);
  // Google은 GIS(ID 토큰) 흐름이라 client id만 있으면 실연동(클라이언트 시크릿 불필요).
  // 실 공급자 자격 증명이 없을 때 운영에서 데모 사용자로 가장하지 않고 안전하게 숨긴다.
  if (id === "google") return c.clientId ? "oauth" : "disabled";
  if (id === "apple") return appleAuthorizationConfigured() ? "oauth" : "disabled";
  if (c.clientId && c.clientSecret) return "oauth";
  if ((id === "kakao" || id === "naver") && socialLoginDemoEnabled()) {
    return "demo";
  }
  return "disabled";
}

/**
 * Redirect-based authorization-code flow availability is intentionally
 * separate from `providerMode()`. Google GIS only needs a public client ID,
 * while the legacy redirect flow also needs the client secret and signed
 * state. Callers must check this before issuing or verifying OAuth state so a
 * valid GIS-only production configuration cannot fall into a state-secret
 * error path.
 */
export function isAuthorizationCodeFlowConfigured(
  id: OAuthProviderId,
): boolean {
  if (DEMO_ONLY_PROVIDERS.has(id)) return false;
  if (id === "apple") return appleAuthorizationConfigured();
  const c = providerConfig(id);
  return Boolean(c.clientId && c.clientSecret);
}

export interface AuthProviderInfo {
  label: string;
  mode: OAuthProviderMode;
  /** Whether the signed-state authorization-code redirect flow is fully configured. */
  redirectAvailable: boolean;
  // GIS 버튼 렌더용 — google 실연동(oauth) 시에만 client id 를 노출(공개해도 안전한 값).
  clientId?: string;
  reason?: "missing-client-id" | "missing-credentials";
}

// providers 엔드포인트 응답 — 설정 여부에 따라 oauth/demo 모드를 함께 노출.
export function listAuthProviders(opts?: { kakao?: boolean; naver?: boolean }) {
  const googleMode = providerMode("google");
  const appleMode = providerMode("apple");
  const githubMode = providerMode("github");
  const kakaoMode = providerMode("kakao");
  const naverMode = providerMode("naver");
  const out: Record<string, AuthProviderInfo> = {
    google: {
      label: "Google",
      mode: googleMode,
      redirectAvailable: isAuthorizationCodeFlowConfigured("google"),
      // GIS 흐름: 실연동일 때만 client id 를 프론트로 노출한다. client secret 은 절대 노출하지 않는다.
      ...(googleMode === "oauth" ? { clientId: googleClientId() } : {}),
      ...(googleMode === "disabled" ? { reason: "missing-client-id" as const } : {}),
    },
    apple: {
      label: "Apple",
      mode: appleMode,
      redirectAvailable: isAuthorizationCodeFlowConfigured("apple"),
      ...(appleMode === "disabled"
        ? { reason: "missing-credentials" as const }
        : {}),
    },
    github: {
      label: "GitHub",
      mode: githubMode,
      redirectAvailable: isAuthorizationCodeFlowConfigured("github"),
      ...(githubMode === "disabled"
        ? { reason: "missing-credentials" as const }
        : {}),
    },
  };
  if (opts?.kakao || kakaoMode === "oauth") {
    out.kakao = {
      label: "카카오",
      mode: kakaoMode,
      redirectAvailable: isAuthorizationCodeFlowConfigured("kakao"),
    };
  }
  if (opts?.naver || naverMode === "oauth") {
    out.naver = {
      label: "네이버",
      mode: naverMode,
      redirectAvailable: isAuthorizationCodeFlowConfigured("naver"),
    };
  }
  return out;
}

// ── 콜백/리다이렉트 베이스 ──
export function redirectUri(id: OAuthProviderId): string {
  const base = env("OAUTH_REDIRECT_BASE_URL") ?? "http://localhost:4001";
  return `${base.replace(/\/$/, "")}/api/auth/oauth/${id}/callback`;
}
export function webAppBaseUrl(): string {
  return (env("WEB_APP_BASE_URL") ?? "http://localhost:5173").replace(/\/$/, "");
}

// ── 서명된 state (서버 저장 없이 CSRF 방지·TTL) ──
const OAUTH_STATE_SECRET_MIN_BYTES = 32;
let DEVELOPMENT_STATE_SECRET: string | undefined;
function stateSecret(): string {
  const raw = process.env.AUTH_STATE_SECRET;
  const configured = raw?.trim();
  if (configured) {
    if (
      process.env.NODE_ENV === "production" &&
      (configured !== raw ||
        Buffer.byteLength(configured, "utf8") <
          OAUTH_STATE_SECRET_MIN_BYTES)
    ) {
      throw new Error(
        `AUTH_STATE_SECRET must be an unpadded secret of at least ${OAUTH_STATE_SECRET_MIN_BYTES} UTF-8 bytes in production`,
      );
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_STATE_SECRET must be set for OAuth state in production");
  }
  DEVELOPMENT_STATE_SECRET ??= randomBytes(32).toString("hex");
  return DEVELOPMENT_STATE_SECRET;
}
function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}
export const OAUTH_STATE_MAX_LENGTH = 512;

export type OAuthStatePurpose = "login" | "link";

export interface OAuthStateContext {
  readonly purpose: OAuthStatePurpose;
  readonly userId: string | null;
}

export function issueState(
  id: OAuthProviderId,
  options: { purpose?: OAuthStatePurpose; userId?: string } = {},
): string {
  const purpose = options.purpose ?? "login";
  const userId = options.userId?.trim() || null;
  if (purpose === "link" && (!userId || userId.length > 128 || /\s/u.test(userId))) {
    throw new Error("a bounded user id is required for OAuth account linking");
  }
  const payload = JSON.stringify({
    p: id,
    n: randomBytes(16).toString("hex"),
    t: Date.now(),
    m: purpose,
    ...(userId ? { u: userId } : {}),
  });
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readOAuthStateContext(
  id: OAuthProviderId,
  state: unknown,
  maxAgeMs = 10 * 60_000,
): OAuthStateContext | null {
  if (
    typeof state !== "string"
    || state.length === 0
    || state.length > OAUTH_STATE_MAX_LENGTH
  ) return null;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length
    || !timingSafeEqual(actualBytes, expectedBytes)
  ) return null;

  let provider: unknown;
  let nonce: unknown;
  let issuedAt: unknown;
  let purpose: unknown = "login";
  let userId: unknown = null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    provider = parsed.p;
    nonce = parsed.n;
    issuedAt = parsed.t;
    purpose = parsed.m ?? "login";
    userId = parsed.u ?? null;
  } catch {
    const legacy = payload.split(".");
    [provider, nonce, issuedAt] = legacy;
  }
  if (provider !== id || !/^[a-f0-9]{32}$/u.test(String(nonce ?? ""))) {
    return null;
  }
  const issued = Number(issuedAt);
  const ageMs = Date.now() - issued;
  if (!Number.isFinite(issued) || ageMs < -60_000 || ageMs >= maxAgeMs) {
    return null;
  }
  if (purpose !== "login" && purpose !== "link") return null;
  if (purpose === "link") {
    if (typeof userId !== "string" || !userId || userId.length > 128 || /\s/u.test(userId)) {
      return null;
    }
    return { purpose, userId };
  }
  return { purpose: "login", userId: null };
}

export function verifyState(
  id: OAuthProviderId,
  state: unknown,
  maxAgeMs = 10 * 60_000,
): boolean {
  return readOAuthStateContext(id, state, maxAgeMs) !== null;
}

export function verifyBrowserBoundState(
  id: OAuthProviderId,
  state: unknown,
  cookieState: unknown,
  maxAgeMs = 10 * 60_000,
): boolean {
  if (
    typeof state !== "string"
    || typeof cookieState !== "string"
    || cookieState.length !== state.length
    || !verifyState(id, state, maxAgeMs)
  ) return false;
  const stateBytes = Buffer.from(state, "utf8");
  const cookieBytes = Buffer.from(cookieState, "utf8");
  return (
    stateBytes.length === cookieBytes.length
    && timingSafeEqual(stateBytes, cookieBytes)
  );
}

const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/u;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function issuePkceVerifier(): string {
  // 48 random bytes encode to 64 unpadded base64url characters (RFC 7636: 43-128).
  return randomBytes(48).toString("base64url");
}

export function isValidPkceVerifier(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && PKCE_VERIFIER_PATTERN.test(value);
}

export function createPkceCodeChallenge(verifier: string): string {
  if (!isValidPkceVerifier(verifier)) {
    throw new Error("invalid PKCE verifier");
  }
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export interface OAuthAuthorizeOptions {
  pkceCodeChallenge?: string;
}

// ── authorize URL ──
export function buildAuthorizeUrl(
  id: OAuthProviderId,
  state: string,
  options: OAuthAuthorizeOptions = {},
): string | null {
  if (!isAuthorizationCodeFlowConfigured(id)) return null;
  const c = providerConfig(id);
  const clientId = c.clientId;
  if (!clientId) return null;
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri(id));
  u.searchParams.set("response_type", "code");
  if (c.scope) u.searchParams.set("scope", c.scope); // 네이버는 scope 없음
  u.searchParams.set("state", state);
  if (id === "google") {
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "select_account");
  }
  if (id === "apple") {
    u.searchParams.set("response_mode", "form_post");
    u.searchParams.set("nonce", appleNonceForState(state));
  }
  if (id === "github") {
    const challenge = options.pkceCodeChallenge;
    if (!challenge || !PKCE_CHALLENGE_PATTERN.test(challenge)) return null;
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

interface NormalizedProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified?: boolean;
  name: string | null;
  image: string | null;
}

export function canAutoLinkOAuthEmail(
  _provider: OAuthProviderId,
  _emailVerified: boolean | undefined,
): boolean {
  // Email is mutable profile data, not a stable provider identity. Even a
  // provider-verified email must never merge into an existing local account
  // without an authenticated, explicit account-link flow.
  return false;
}

function normalizedEmail(value: unknown): string | null {
  const email = str(value)?.trim().toLowerCase() ?? "";
  if (!email || email.length > 254 || !email.includes("@") || /\s/u.test(email)) {
    return null;
  }
  return email;
}

function normalizedProviderAccountId(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("provider profile account id is missing");
  }
  const id = String(value).trim();
  if (!id || id.length > 512) {
    throw new Error("provider profile account id is invalid");
  }
  return id;
}

export function selectGitHubVerifiedEmail(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const verified = value
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      email: normalizedEmail(entry.email),
      primary: entry.primary === true,
      verified: entry.verified === true,
    }))
    .filter((entry): entry is { email: string; primary: boolean; verified: true } =>
      entry.verified && entry.email !== null,
    );
  return verified.find((entry) => entry.primary)?.email ?? verified[0]?.email ?? null;
}

type AppleJwk = {
  kty: "RSA";
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

let appleJwksCache: { expiresAt: number; keys: AppleJwk[] } | null = null;

function decodeJwtObject(value: string): JsonRecord {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return asRecord(JSON.parse(decoded));
  } catch {
    throw new Error("invalid Apple identity token encoding");
  }
}

function isAppleJwk(value: unknown): value is AppleJwk {
  const key = asRecord(value);
  return key.kty === "RSA"
    && typeof key.kid === "string"
    && typeof key.n === "string"
    && typeof key.e === "string";
}

async function appleJwks(now = Date.now()): Promise<AppleJwk[]> {
  if (appleJwksCache && appleJwksCache.expiresAt > now) {
    return appleJwksCache.keys;
  }
  const response = await fetch("https://appleid.apple.com/auth/keys", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Apple JWKS fetch failed (${response.status})`);
  const payload = asRecord(await response.json());
  const keys = Array.isArray(payload.keys)
    ? payload.keys.filter(isAppleJwk)
    : [];
  if (keys.length === 0) throw new Error("Apple JWKS response had no usable keys");
  appleJwksCache = { expiresAt: now + 60 * 60_000, keys };
  return keys;
}

export function parseAppleUserName(value: unknown): string | null {
  let raw = value;
  if (typeof raw === "string") {
    if (raw.length > 8_192) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const user = asRecord(raw);
  const name = asRecord(user.name);
  const clean = (part: unknown) =>
    typeof part === "string"
      ? part.replace(/\p{Cc}+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 100)
      : "";
  const first = clean(name.firstName);
  const last = clean(name.lastName);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || null;
}

export async function verifyAppleIdentityToken(
  idToken: string,
  state: string,
  now = Date.now(),
): Promise<NormalizedProfile> {
  const clientId = env("APPLE_SERVICE_ID") ?? env("APPLE_CLIENT_ID");
  if (!clientId) throw new Error("Apple client id is not configured");
  const token = idToken.trim();
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 16_384) {
    throw new Error("invalid Apple identity token format");
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJwtObject(headerPart);
  const payload = decodeJwtObject(payloadPart);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("unsupported Apple identity token header");
  }
  const keys = await appleJwks(now);
  const jwk = keys.find(
    (candidate) =>
      candidate.kid === header.kid
      && (candidate.alg === undefined || candidate.alg === "RS256")
      && (candidate.use === undefined || candidate.use === "sig"),
  );
  if (!jwk) throw new Error("Apple identity token signing key was not found");
  const publicKey = createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
    },
    format: "jwk",
  });
  const signature = Buffer.from(signaturePart, "base64url");
  const verified = verifyPayload(
    "RSA-SHA256",
    Buffer.from(`${headerPart}.${payloadPart}`, "ascii"),
    publicKey,
    signature,
  );
  if (!verified) throw new Error("Apple identity token signature is invalid");

  const nowSeconds = Math.floor(now / 1000);
  const audience = payload.aud;
  const audienceMatches = audience === clientId
    || (Array.isArray(audience) && audience.includes(clientId));
  if (payload.iss !== "https://appleid.apple.com" || !audienceMatches) {
    throw new Error("Apple identity token issuer or audience is invalid");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Apple identity token is expired");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60) {
    throw new Error("Apple identity token issued-at time is invalid");
  }
  if (payload.nonce !== appleNonceForState(state)) {
    throw new Error("Apple identity token nonce is invalid");
  }
  const providerAccountId = normalizedProviderAccountId(payload.sub);
  const email = normalizedEmail(payload.email);
  const emailVerified = email !== null
    && (payload.email_verified === true || payload.email_verified === "true");
  return {
    providerAccountId,
    email: emailVerified ? email : null,
    emailVerified,
    name: null,
    image: null,
  };
}

async function exchangeCode(
  id: OAuthProviderId,
  code: string,
  state: string,
  pkceVerifier?: string,
): Promise<Record<string, unknown>> {
  const c = providerConfig(id);
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: c.clientId ?? "",
    redirect_uri: redirectUri(id),
    code,
  };
  if (id === "apple") params.client_secret = createAppleClientSecret();
  else if (c.clientSecret) params.client_secret = c.clientSecret;
  // Naver requires the callback state again during the authorization-code exchange.
  if (id === "naver") params.state = state;
  if (id === "github") {
    if (!isValidPkceVerifier(pkceVerifier)) {
      throw new Error("missing or invalid GitHub PKCE verifier");
    }
    params.code_verifier = pkceVerifier;
  }
  const body = new URLSearchParams(params);
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const payload = (await res.json()) as Record<string, unknown>;
  if (typeof payload.error === "string") {
    throw new Error("provider rejected token exchange");
  }
  return payload;
}

function providerProfileHeaders(
  id: OAuthProviderId,
  accessToken: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (id === "github") {
    headers.Accept = "application/vnd.github+json";
    headers["User-Agent"] = "ToonSpectrum-OAuth";
    headers["X-GitHub-Api-Version"] = "2026-03-10";
  }
  return headers;
}

async function fetchProfile(
  id: OAuthProviderId,
  accessToken: string,
): Promise<NormalizedProfile> {
  const c = providerConfig(id);
  const headers = providerProfileHeaders(id, accessToken);
  const res = await fetch(c.userInfoUrl, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`profile fetch failed (${res.status})`);
  const raw = (await res.json()) as JsonRecord;
  if (id === "google") {
    const email = normalizedEmail(raw.email);
    const emailVerified = raw.email_verified === true;
    if (!email || !emailVerified) {
      throw new GoogleAuthCredentialError("google email is missing or unverified");
    }
    return {
      providerAccountId: normalizedProviderAccountId(raw.sub),
      email,
      emailVerified,
      name: str(raw.name) ?? str(raw.given_name),
      image: str(raw.picture),
    };
  }
  if (id === "github") {
    let verifiedEmail: string | null = null;
    if (c.emailInfoUrl) {
      const emailResponse = await fetch(c.emailInfoUrl, {
        headers,
        signal: AbortSignal.timeout(12_000),
      });
      if (emailResponse.ok) {
        verifiedEmail = selectGitHubVerifiedEmail(await emailResponse.json());
      }
    }
    return {
      providerAccountId: normalizedProviderAccountId(raw.id),
      email: verifiedEmail,
      emailVerified: verifiedEmail !== null,
      name: str(raw.name) ?? str(raw.login),
      image: str(raw.avatar_url),
    };
  }
  if (id === "naver") {
    // Naver exposes a consented profile email but no verification assertion.
    // Preserve it only as transient profile data; account creation/linking uses
    // the provider id unless an authenticated explicit-link flow is added.
    const r = asRecord(raw.response);
    return {
      providerAccountId: normalizedProviderAccountId(r.id),
      email: normalizedEmail(r.email),
      emailVerified: false,
      name: str(r.name) ?? str(r.nickname),
      image: str(r.profile_image),
    };
  }
  // kakao
  const acc = asRecord(raw.kakao_account);
  const profile = asRecord(acc.profile ?? raw.properties);
  const email = normalizedEmail(acc.email);
  const emailVerified =
    email !== null
    && acc.is_email_valid === true
    && acc.is_email_verified === true;
  return {
    providerAccountId: normalizedProviderAccountId(raw.id),
    email: emailVerified ? email : null,
    emailVerified,
    name: str(profile.nickname),
    image: str(profile.profile_image_url) ?? str(profile.profile_image),
  };
}

// Runtime role은 DML 권한만 가진다. OAuth 핫패스에서는 필요한 컬럼을
// 데이터 조회 없이 확인하고, 스키마 생성·변경은 migration에만 맡긴다.
let oauthTablesReady: Promise<void> | null = null;

async function assertOAuthTables(): Promise<void> {
  await ensureUserLifecycleSchema();
  await dbClient.execute(`
    SELECT
      "userId",
      "type",
      "provider",
      "providerAccountId",
      "refresh_token",
      "access_token",
      "expires_at",
      "token_type",
      "scope",
      "id_token",
      "session_state"
    FROM "account"
    WHERE FALSE
  `);
}

export async function ensureOAuthTables(): Promise<void> {
  const pending = oauthTablesReady ??= assertOAuthTables();

  try {
    await pending;
  } catch (error) {
    if (oauthTablesReady === pending) oauthTablesReady = null;
    throw error;
  }
}

const AVATAR_COLORS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];
function avatarFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// 프로필 → user/account upsert. 제공자 subject만 로그인 정체성으로 사용한다.
// 검증된 이메일은 새 계정의 연락처로만 저장하며 기존 계정과 자동 병합하지 않는다.
async function upsertOAuthUser(
  id: OAuthProviderId,
  profile: NormalizedProfile,
): Promise<OAuthUser> {
  await ensureOAuthTables();
  const trustedEmail = profile.emailVerified === true ? profile.email : null;
  const email = trustedEmail
    ?? `${id}_${profile.providerAccountId}@${id}.local`;
  const name = profile.name ?? providerConfig(id).label;
  const accountPredicate = and(
    eq(accounts.provider, id),
    eq(accounts.providerAccountId, profile.providerAccountId),
  );

  const userId = await db.transaction(async (transaction) => {
    const findLinkedUserId = async (): Promise<string | null> => {
      const [linked] = await transaction
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(accountPredicate)
        .limit(1);
      return linked?.userId ?? null;
    };

    const alreadyLinkedUserId = await findLinkedUserId();
    if (alreadyLinkedUserId) return alreadyLinkedUserId;

    if (trustedEmail) {
      const [existingEmailOwner] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, trustedEmail))
        .limit(1);
      if (existingEmailOwner) {
        // A concurrent callback for the same provider subject may have completed
        // between the first account lookup and the email lookup. Only that exact
        // provider identity may win automatically; unrelated accounts must link
        // from an already authenticated session.
        const racedLinkedUserId = await findLinkedUserId();
        if (racedLinkedUserId) return racedLinkedUserId;
        throw new OAuthAccountLinkRequiredError(id);
      }
    }

    const candidateUserId = randomUUID();
    const [insertedUser] = await transaction
      .insert(users)
      .values({
        id: candidateUserId,
        email,
        emailVerified: trustedEmail ? new Date() : null,
        name,
        image: profile.image ?? null,
        avatar: avatarFor(email),
        role: "user",
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    let accountOwnerCandidateId = insertedUser?.id ?? null;
    if (!accountOwnerCandidateId) {
      const racedLinkedUserId = await findLinkedUserId();
      if (racedLinkedUserId) return racedLinkedUserId;
      if (trustedEmail) throw new OAuthAccountLinkRequiredError(id);

      // Provider-scoped placeholder addresses are deterministic and cannot be
      // supplied by the user. Reusing one only repairs a prior interrupted
      // provider-subject insert; it never merges a user-controlled email.
      const [providerScopedUser] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!providerScopedUser) {
        throw new Error("oauth user conflict could not be resolved");
      }
      accountOwnerCandidateId = providerScopedUser.id;
    }

    await transaction
      .insert(accounts)
      .values({
        userId: accountOwnerCandidateId,
        type: "oauth",
        provider: id,
        providerAccountId: profile.providerAccountId,
      })
      .onConflictDoNothing({
        target: [accounts.provider, accounts.providerAccountId],
      });

    const authoritativeUserId = await findLinkedUserId();
    if (!authoritativeUserId) {
      throw new Error("oauth account conflict could not be resolved");
    }

    if (insertedUser && authoritativeUserId !== insertedUser.id) {
      await transaction.delete(users).where(eq(users.id, insertedUser.id));
    }
    return authoritativeUserId;
  });

  // 레거시 구현이 저장했던 공급자 토큰도 해당 계정의 다음 로그인에서 제거한다.
  // 사용자 로그인에는 ToonSpectrum 자체 세션만 필요하며 외부 장기 자격 증명을 보존하지 않는다.
  await db
    .update(accounts)
    .set({
      refresh_token: null,
      access_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      id_token: null,
      session_state: null,
    })
    .where(accountPredicate);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const block = getUserAuthBlock(user);
  if (block) throw new OAuthAccountBlockedError(block);

  const resolvedEmail = user?.email ?? email;
  const role = normalizePersistedAuthRole(user?.role);

  return {
    id: userId,
    name: user?.name ?? name,
    email: resolvedEmail,
    image: user?.image ?? profile.image ?? null,
    role,
    sessionVersion: normalizeSessionVersion(user?.sessionVersion),
  };
}

async function linkOAuthUser(
  id: OAuthProviderId,
  profile: NormalizedProfile,
  targetUserId: string,
): Promise<OAuthUser> {
  await ensureOAuthTables();
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  const block = getUserAuthBlock(targetUser);
  if (!targetUser || block) {
    throw new OAuthAccountBlockedError(
      block ?? "연결할 사용자 계정을 찾을 수 없어요.",
    );
  }

  await db.transaction(async (transaction) => {
    const [identityOwner] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(
        eq(accounts.provider, id),
        eq(accounts.providerAccountId, profile.providerAccountId),
      ))
      .limit(1);
    if (identityOwner?.userId === targetUserId) return;
    if (identityOwner) throw new OAuthIdentityAlreadyLinkedError(id);

    const [existingProviderLink] = await transaction
      .select({ providerAccountId: accounts.providerAccountId })
      .from(accounts)
      .where(and(
        eq(accounts.userId, targetUserId),
        eq(accounts.provider, id),
      ))
      .limit(1);
    if (existingProviderLink) throw new OAuthProviderAlreadyLinkedError(id);

    await transaction
      .insert(accounts)
      .values({
        userId: targetUserId,
        type: "oauth",
        provider: id,
        providerAccountId: profile.providerAccountId,
      })
      .onConflictDoNothing();

    const [authoritativeIdentity] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(
        eq(accounts.provider, id),
        eq(accounts.providerAccountId, profile.providerAccountId),
      ))
      .limit(1);
    if (authoritativeIdentity?.userId !== targetUserId) {
      throw new OAuthIdentityAlreadyLinkedError(id);
    }

    if (
      profile.emailVerified === true
      && profile.email
      && targetUser.email === profile.email
      && !targetUser.emailVerified
    ) {
      await transaction
        .update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.id, targetUserId));
    }
  });

  return {
    id: targetUser.id,
    name: targetUser.name ?? profile.name,
    email: targetUser.email ?? profile.email,
    image: targetUser.image ?? profile.image,
    role: normalizePersistedAuthRole(targetUser.role),
    sessionVersion: normalizeSessionVersion(targetUser.sessionVersion),
  };
}

// 실제 OAuth 콜백 처리: code → token → profile → 로그인 또는 명시적 연결.
export async function handleOAuthCallback(
  id: OAuthProviderId,
  code: string,
  state: string,
  pkceVerifier?: string,
  options: { linkToUserId?: string; appleUser?: unknown } = {},
): Promise<OAuthUser> {
  const tokens = await exchangeCode(id, code, state, pkceVerifier);
  let profile: NormalizedProfile;
  if (id === "apple") {
    const idToken = typeof tokens.id_token === "string" ? tokens.id_token : "";
    if (!idToken) throw new Error("Apple token exchange returned no identity token");
    profile = await verifyAppleIdentityToken(idToken, state);
    const firstAuthorizationName = parseAppleUserName(options.appleUser);
    if (firstAuthorizationName) profile.name = firstAuthorizationName;
  } else {
    const accessToken = tokens.access_token as string | undefined;
    if (!accessToken) throw new Error("no access_token");
    profile = await fetchProfile(id, accessToken);
  }
  // 로그인 전용 OAuth 토큰은 저장하지 않는다. 제공자 신원을 확인한 뒤 자체 HttpOnly 세션을 사용한다.
  return options.linkToUserId
    ? linkOAuthUser(id, profile, options.linkToUserId)
    : upsertOAuthUser(id, profile);
}

// ── Google Identity Services(GIS): ID 토큰 검증 ──
// 프론트(GIS 버튼)가 받은 ID 토큰을 서버에서 검증한다. 인가-코드/토큰 교환이 없어
// client secret 이 필요 없고, 기존 GOOGLE_OAUTH_CLIENT_ID 를 audience 로 재사용한다.
export function googleClientId(): string | undefined {
  return providerConfig("google").clientId;
}

export const GOOGLE_ID_TOKEN_MAX_LENGTH = 16_384;

// google-auth-library OAuth2Client 는 JWK(구글 공개키)를 내부 캐시한다 — 모듈 수명 동안 재사용.
let googleVerifier: OAuth2Client | null = null;
function getGoogleVerifier(): OAuth2Client {
  googleVerifier ??= new OAuth2Client();
  return googleVerifier;
}

// ID 토큰 → 정규화 프로필. 서명·만료·aud(우리 client id)·iss(accounts.google.com) 를 모두 검증한다.
export async function verifyGoogleIdToken(idToken: string): Promise<NormalizedProfile> {
  const audience = googleClientId();
  if (!audience) throw new GoogleAuthConfigurationError();
  const token = typeof idToken === "string" ? idToken.trim() : "";
  if (
    !token
    || token.length > GOOGLE_ID_TOKEN_MAX_LENGTH
    || token.split(".").length !== 3
  ) {
    throw new GoogleAuthCredentialError("invalid id_token format");
  }

  let ticket;
  try {
    ticket = await getGoogleVerifier().verifyIdToken({ idToken: token, audience });
  } catch {
    throw new GoogleAuthCredentialError("google id_token verification failed");
  }
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new GoogleAuthCredentialError("invalid id_token payload");
  // iss 는 google-auth-library 가 검증하지만 방어적으로 한 번 더 확인.
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new GoogleAuthCredentialError("invalid issuer");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new GoogleAuthCredentialError("google email is missing or unverified");
  }
  return {
    providerAccountId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name ?? payload.given_name ?? null,
    image: payload.picture ?? null,
  };
}

// GIS 로그인/연결 처리: ID 토큰 검증 후 제공자 subject만 사용한다.
export async function handleGoogleIdToken(
  idToken: string,
  options: { linkToUserId?: string } = {},
): Promise<OAuthUser> {
  const profile = await verifyGoogleIdToken(idToken);
  // ID 토큰은 로그인 순간의 검증 증명일 뿐 장기 자격 증명이 아니다. 검증 후 원문을 저장하지 않는다.
  return options.linkToUserId
    ? linkOAuthUser("google", profile, options.linkToUserId)
    : upsertOAuthUser("google", profile);
}

// 데모 폴백: 실제 제공자 연동 없이 명확히 [데모] 표시된 사용자 생성/재사용.
export async function createDemoUser(id: OAuthProviderId): Promise<OAuthUser> {
  const c = providerConfig(id);
  try {
    return await upsertOAuthUser(id, {
      providerAccountId: `demo-${id}`,
      email: c.demoEmail,
      name: c.demoName,
      image: null,
    });
  } catch {
    // DB(Neon) 불가(쿼터/장애) 시에도 데모 체험은 가능해야 한다 — 영속화 없이 합성 데모 사용자 반환.
    // 합성 id도 서명된 HttpOnly 세션 쿠키로 검증되므로 DB 행 없이 데모 체험이 동작한다.
    return { id: `demo-${id}`, name: c.demoName, email: c.demoEmail, image: null, role: "user", sessionVersion: 1 };
  }
}

// ── 핸드오프: 콜백이 발급한 1회용 토큰으로 프론트가 사용자 객체를 교환(URL에 PII 미노출) ──
const handoffStore = new Map<string, { user: OAuthUser; exp: number }>();
export function issueHandoff(user: OAuthUser): string {
  const token = randomBytes(24).toString("base64url");
  handoffStore.set(token, { user, exp: Date.now() + 120_000 });
  if (handoffStore.size > 5000) {
    const now = Date.now();
    for (const [k, v] of handoffStore) if (v.exp < now) handoffStore.delete(k);
  }
  return token;
}
export function consumeHandoff(token: string | undefined): OAuthUser | null {
  if (!token) return null;
  const entry = handoffStore.get(token);
  if (!entry) return null;
  handoffStore.delete(token); // 1회용
  if (entry.exp < Date.now()) return null;
  return entry.user;
}
