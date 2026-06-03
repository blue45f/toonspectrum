import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { accounts, db, users } from "../db";

// ── 소셜 로그인(Google·Kakao) OAuth 2.0 인가-코드 흐름 ──
// 실제 OAuth: 환경변수(client id/secret)가 있으면 동작. 없으면 데모 폴백(명확히 [데모] 표시)으로 대체.
// 세션은 기존 스킴(localStorage + x-user-id 헤더)과 동일하게 사용자 객체를 프론트로 핸드오프한다.
// 주의: 이 앱의 인증은 데모 수준(쿠키/서버세션 없음)이라 보안 경계가 약하다 — 실서비스 전 세션 강화 필요.

export type OAuthProviderId = "google" | "kakao";

export interface OAuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
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
  return value === "google" || value === "kakao";
}

export function providerMode(id: OAuthProviderId): "oauth" | "demo" {
  const c = providerConfig(id);
  return c.clientId && c.clientSecret ? "oauth" : "demo";
}

// providers 엔드포인트 응답 — 설정 여부에 따라 oauth/demo 모드를 함께 노출.
export function listAuthProviders() {
  return {
    google: { label: "Google", mode: providerMode("google") },
    kakao: { label: "카카오", mode: providerMode("kakao") },
  };
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
let STATE_SECRET = env("AUTH_STATE_SECRET");
function stateSecret(): string {
  if (!STATE_SECRET) STATE_SECRET = randomBytes(32).toString("hex"); // 프로세스 수명 동안 유지
  return STATE_SECRET;
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
  const c = providerConfig(id);
  if (!c.clientId || !c.clientSecret) return null;
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", redirectUri(id));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", c.scope);
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
  name: string | null;
  image: string | null;
}

async function exchangeCode(id: OAuthProviderId, code: string): Promise<Record<string, unknown>> {
  const c = providerConfig(id);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId ?? "",
    client_secret: c.clientSecret ?? "",
    redirect_uri: redirectUri(id),
    code,
  });
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
  const raw = (await res.json()) as Record<string, any>;
  if (id === "google") {
    return {
      providerAccountId: String(raw.sub),
      email: typeof raw.email === "string" ? raw.email.toLowerCase() : null,
      name: raw.name ?? raw.given_name ?? null,
      image: raw.picture ?? null,
    };
  }
  // kakao
  const acc = raw.kakao_account ?? {};
  const profile = acc.profile ?? raw.properties ?? {};
  return {
    providerAccountId: String(raw.id),
    email: typeof acc.email === "string" ? acc.email.toLowerCase() : null,
    name: profile.nickname ?? null,
    image: profile.profile_image_url ?? profile.profile_image ?? null,
  };
}

// account/user 테이블 보장 — drizzle-kit 미적용 환경에서도 첫 OAuth 시 생성.
let oauthTablesReady: Promise<void> | null = null;
export function ensureOAuthTables(): Promise<void> {
  oauthTablesReady ??= (async () => {
    const { dbClient } = await import("../db");
    await dbClient.execute(`CREATE TABLE IF NOT EXISTS "account" (
      "userId" text NOT NULL,
      "type" text NOT NULL,
      "provider" text NOT NULL,
      "providerAccountId" text NOT NULL,
      "refresh_token" text,
      "access_token" text,
      "expires_at" integer,
      "token_type" text,
      "scope" text,
      "id_token" text,
      "session_state" text,
      PRIMARY KEY ("provider", "providerAccountId")
    )`);
  })();
  return oauthTablesReady;
}

const AVATAR_COLORS = ["#ff5a36", "#9b7bff", "#5a8cff", "#22b8a6", "#ff6b9d", "#f4a52a"];
function avatarFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// 프로필 → user/account upsert. 이메일 일치 시 기존 계정에 연결, 없으면 신규 생성.
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
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) {
      userId = byEmail.id;
    } else {
      userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        email,
        name,
        image: profile.image ?? null,
        avatar: avatarFor(email),
        role: "user",
      });
    }
    await db.insert(accounts).values({
      userId,
      type: "oauth",
      provider: id,
      providerAccountId: profile.providerAccountId,
      access_token: (tokens?.access_token as string) ?? null,
      refresh_token: (tokens?.refresh_token as string) ?? null,
      token_type: (tokens?.token_type as string) ?? null,
      scope: (tokens?.scope as string) ?? null,
      id_token: (tokens?.id_token as string) ?? null,
    });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return {
    id: userId,
    name: user?.name ?? name,
    email: user?.email ?? email,
    image: user?.image ?? profile.image ?? null,
    role: normalizeRole(user?.role),
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

// 데모 폴백: 실제 제공자 연동 없이 명확히 [데모] 표시된 사용자 생성/재사용.
export async function createDemoUser(id: OAuthProviderId): Promise<OAuthUser> {
  const c = providerConfig(id);
  return upsertOAuthUser(id, {
    providerAccountId: `demo-${id}`,
    email: c.demoEmail,
    name: c.demoName,
    image: null,
  });
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
