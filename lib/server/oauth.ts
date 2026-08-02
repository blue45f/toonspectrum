import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";

import { accounts, db, dbClient, users } from "../db";

import { ensureUserLifecycleSchema, getUserAuthBlock, normalizeSessionVersion } from "./user-lifecycle";

// ── 소셜 로그인(Google·Kakao·Naver) ──
// Google: GIS(Google Identity Services) ID 토큰 흐름. 프론트가 받은 ID 토큰을 google-auth-library
//   verifyIdToken 으로 서버 검증(서명·aud·iss·exp)해 신원을 확정한다(인가-코드 교환 불필요).
//   하위 호환: 기존 인가-코드 콜백 경로(handleOAuthCallback)도 키 설정 시 그대로 동작한다.
// Kakao·Naver: 실 앱키(REST API key / client secret) 가 없어 의도적으로 데모 고정(DEMO_ONLY_PROVIDERS).
//   실연동 재개 시 외부 앱키 발급 후 이 집합에서 제거하면 인가-코드 흐름으로 동작한다.
// 세션은 서명 JWT(lib/server/session.ts)로 발급되어 HttpOnly 쿠키에 저장된다.
// 마이그레이션 중인 탭 전용 클라이언트는 같은 JWT를 x-user-id 헤더로도 보낼 수 있다.

export type OAuthProviderId = "google" | "kakao" | "naver";
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

// 소셜 로그인(Google·Kakao·Naver) 실연동 활성화
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

interface ProviderConfig {
  id: OAuthProviderId;
  label: string;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  demoName: string;
  demoEmail: string;
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
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
    // 카카오는 REST API 키를 client_id 로 사용. client secret 은 선택(보안 설정 시 필수).
    clientId: env("KAKAO_REST_API_KEY") ?? env("KAKAO_OAUTH_CLIENT_ID"),
    clientSecret: env("KAKAO_CLIENT_SECRET") ?? env("KAKAO_OAUTH_CLIENT_SECRET"),
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userInfoUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "profile_nickname profile_image account_email",
    demoName: "카카오 데모 사용자",
    demoEmail: "demo.kakao@webdex.local",
  };
}

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return value === "google" || value === "kakao" || value === "naver";
}

export function providerMode(id: OAuthProviderId): OAuthProviderMode {
  if (DEMO_ONLY_PROVIDERS.has(id)) return "demo";
  const c = providerConfig(id);
  // Google 은 GIS(ID 토큰) 흐름이라 client id 만 있으면 실연동(클라이언트 시크릿 불필요).
  // Google 로그인은 실제 Google 계정임을 전제로 하므로, 설정이 없을 때 데모 계정으로 가장하지 않는다.
  if (id === "google") return c.clientId ? "oauth" : "disabled";
  if (id === "kakao") return c.clientId ? "oauth" : "demo";
  return c.clientId && c.clientSecret ? "oauth" : "demo";
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
  const c = providerConfig(id);
  if (id === "kakao") return Boolean(c.clientId);
  return Boolean(c.clientId && c.clientSecret);
}

export interface AuthProviderInfo {
  label: string;
  mode: OAuthProviderMode;
  // GIS 버튼 렌더용 — google 실연동(oauth) 시에만 client id 를 노출(공개해도 안전한 값).
  clientId?: string;
  reason?: "missing-client-id";
}

// providers 엔드포인트 응답 — 설정 여부에 따라 oauth/demo 모드를 함께 노출.
export function listAuthProviders(opts?: { kakao?: boolean; naver?: boolean }) {
  const googleMode = providerMode("google");
  const kakaoMode = providerMode("kakao");
  const naverMode = providerMode("naver");
  const out: Record<string, AuthProviderInfo> = {
    google: {
      label: "Google",
      mode: googleMode,
      // GIS 흐름: 실연동일 때만 client id 를 프론트로 노출한다. client secret 은 절대 노출하지 않는다.
      ...(googleMode === "oauth" ? { clientId: googleClientId() } : {}),
      ...(googleMode === "disabled" ? { reason: "missing-client-id" as const } : {}),
    },
  };
  if (opts?.kakao || kakaoMode === "oauth") out.kakao = { label: "카카오", mode: kakaoMode };
  if (opts?.naver || naverMode === "oauth") out.naver = { label: "네이버", mode: naverMode };
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
export function issueState(id: OAuthProviderId): string {
  const payload = `${id}.${randomBytes(8).toString("hex")}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}
export function verifyState(id: OAuthProviderId, state: string | undefined, maxAgeMs = 10 * 60_000): boolean {
  if (!state || typeof state !== "string") return false;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return false;
  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString();
  } catch {
    return false;
  }
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [pid, , ts] = payload.split(".");
  if (pid !== id) return false;
  const issued = Number(ts);
  return Number.isFinite(issued) && Date.now() - issued < maxAgeMs;
}

// ── authorize URL ──
export function buildAuthorizeUrl(id: OAuthProviderId, state: string): string | null {
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
  return u.toString();
}

interface NormalizedProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified?: boolean;
  name: string | null;
  image: string | null;
}

async function exchangeCode(id: OAuthProviderId, code: string): Promise<Record<string, unknown>> {
  const c = providerConfig(id);
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: c.clientId ?? "",
    redirect_uri: redirectUri(id),
    code,
  };
  if (c.clientSecret) {
    params.client_secret = c.clientSecret;
  }
  const body = new URLSearchParams(params);
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

async function fetchProfile(id: OAuthProviderId, accessToken: string): Promise<NormalizedProfile> {
  const c = providerConfig(id);
  const res = await fetch(c.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`profile fetch failed (${res.status})`);
  const raw = (await res.json()) as JsonRecord;
  if (id === "google") {
    const email = str(raw.email)?.toLowerCase() ?? null;
    const emailVerified = raw.email_verified === true;
    if (!email || !emailVerified) {
      throw new GoogleAuthCredentialError("google email is missing or unverified");
    }
    return {
      providerAccountId: String(raw.sub),
      email,
      emailVerified,
      name: str(raw.name) ?? str(raw.given_name),
      image: str(raw.picture),
    };
  }
  if (id === "naver") {
    // 네이버: { resultcode, message, response: { id, email, name, nickname, profile_image } }
    const r = asRecord(raw.response);
    return {
      providerAccountId: String(r.id),
      email: str(r.email)?.toLowerCase() ?? null,
      name: str(r.name) ?? str(r.nickname),
      image: str(r.profile_image),
    };
  }
  // kakao
  const acc = asRecord(raw.kakao_account);
  const profile = asRecord(acc.profile ?? raw.properties);
  return {
    providerAccountId: String(raw.id),
    email: str(acc.email)?.toLowerCase() ?? null,
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

// 프로필 → user/account upsert. Google은 검증된 이메일만 기존 계정에 연결하고, 없으면 신규 생성.
async function upsertOAuthUser(
  id: OAuthProviderId,
  profile: NormalizedProfile,
  tokens?: Record<string, unknown>
): Promise<OAuthUser> {
  await ensureOAuthTables();
  const email = profile.email ?? `${id}_${profile.providerAccountId}@${id}.local`;
  const name = profile.name ?? providerConfig(id).label;

  const [linked] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, id), eq(accounts.providerAccountId, profile.providerAccountId)))
    .limit(1);

  let userId = linked?.userId;
  if (!userId) {
    const mayLinkByEmail = id !== "google" || profile.emailVerified === true;
    const [byEmail] = mayLinkByEmail
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
      : [];
    if (byEmail) {
      userId = byEmail.id;
    } else {
      const candidateUserId = randomUUID();
      const [insertedUser] = await db
        .insert(users)
        .values({
          id: candidateUserId,
          email,
          name,
          image: profile.image ?? null,
          avatar: avatarFor(email),
          role: "user",
        })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (insertedUser) {
        userId = insertedUser.id;
      } else {
        // A concurrent first login may have inserted the same unique email.
        // Only the existing verified-link policy may adopt that authoritative row.
        const [authoritativeUser] = mayLinkByEmail
          ? await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, email))
              .limit(1)
          : [];
        if (!authoritativeUser) {
          throw new Error("oauth user conflict could not be resolved");
        }
        userId = authoritativeUser.id;
      }
    }
    await db
      .insert(accounts)
      .values({
        userId,
        type: "oauth",
        provider: id,
        providerAccountId: profile.providerAccountId,
        access_token: (tokens?.access_token as string) ?? null,
        refresh_token: (tokens?.refresh_token as string) ?? null,
        token_type: (tokens?.token_type as string) ?? null,
        scope: (tokens?.scope as string) ?? null,
        id_token: (tokens?.id_token as string) ?? null,
      })
      .onConflictDoNothing({
        target: [accounts.provider, accounts.providerAccountId],
      });

    // The composite provider key, not this request's candidate user, owns the
    // final linkage when concurrent valid callbacks race.
    const [authoritativeAccount] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, id),
          eq(accounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);
    if (!authoritativeAccount) {
      throw new Error("oauth account conflict could not be resolved");
    }
    userId = authoritativeAccount.userId;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const block = getUserAuthBlock(user);
  if (block) throw new OAuthAccountBlockedError(block);
  return {
    id: userId,
    name: user?.name ?? name,
    email: user?.email ?? email,
    image: user?.image ?? profile.image ?? null,
    role: normalizeRole(user?.role),
    sessionVersion: normalizeSessionVersion(user?.sessionVersion),
  };
}

function normalizeRole(value: string | null | undefined): string {
  const role = String(value ?? "").toLowerCase();
  return ["admin", "creator", "operator"].includes(role) ? role : "user";
}

// 실제 OAuth 콜백 처리: code → token → profile → upsert.
export async function handleOAuthCallback(id: OAuthProviderId, code: string): Promise<OAuthUser> {
  const tokens = await exchangeCode(id, code);
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) throw new Error("no access_token");
  const profile = await fetchProfile(id, accessToken);
  return upsertOAuthUser(id, profile, tokens);
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

// GIS 로그인 처리: ID 토큰 검증 → user/account upsert. (kakao/naver 는 데모이므로 google 전용)
export async function handleGoogleIdToken(idToken: string): Promise<OAuthUser> {
  const profile = await verifyGoogleIdToken(idToken);
  // ID 토큰은 로그인 순간의 검증 증명일 뿐 장기 자격 증명이 아니다. 검증 후 원문을 저장하지 않는다.
  return upsertOAuthUser("google", profile);
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
