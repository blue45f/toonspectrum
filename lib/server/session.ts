import { createHmac, timingSafeEqual } from "crypto";

// 서명 세션 토큰 — 클라이언트가 보내는 신원(x-user-id)을 서버 비밀로 검증한다.
//
// 형식(현재): 표준 HS256 JWT.  header.payload.signature (각 base64url).
//   payload = { sub: userId, sv: sessionVersion, iss, aud, iat, exp }
//   - iss/aud 를 고정해 다른 토큰(예: OAuth state)과 혼용·재사용을 막는다.
//   - sv(sessionVersion)·계정 상태는 DB(isSessionAllowed)에서 다시 확인해 서버 로그아웃·정지·탈퇴를 반영한다.
//   비밀(HMAC-SHA256) 없이는 위조할 수 없다.
//
// 형식(레거시 v2): "v2.<userId>.<sessionVersion>.<expiresAtMs>.<base64url(HMAC)>".
//   기존에 발급된 v2 토큰은 만료(최대 30일) 전까지 그대로 검증해 재로그인 없이 투명하게 흡수한다.
//   신규 토큰은 항상 JWT 로 발급된다(점진적 마이그레이션 → 사용자 락아웃 없음).
//
// 강화(보안):
//   - 운영(NODE_ENV=production)에서 AUTH_SESSION_SECRET(또는 AUTH_STATE_SECRET) 미설정 시 서명 거부(약한 폴백 비밀 차단).
//   - 서명 비교는 항상 timingSafeEqual(상수 시간).
//   - exp/iat/iss/aud 를 모두 검증.

const FALLBACK_SECRET = "toonspectrum-insecure-dev-session-secret";
export const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const JWT_ISSUER = "toonspectrum";
const JWT_AUDIENCE = "toonspectrum-web";

export interface VerifiedSessionToken {
  userId: string;
  sessionVersion: number;
  expiresAt: number;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function secret(): string {
  // 운영에선 AUTH_SESSION_SECRET(없으면 기존 AUTH_STATE_SECRET) 사용. 로컬 개발용 폴백만 별도.
  const configured = process.env.AUTH_SESSION_SECRET || process.env.AUTH_STATE_SECRET;
  if (configured && configured.trim()) return configured.trim();
  // 운영에서 비밀이 없으면 약한 폴백으로 토큰을 발급/검증하지 않는다(위조·세션 탈취 차단).
  if (isProduction()) {
    throw new Error("AUTH_SESSION_SECRET (or AUTH_STATE_SECRET) must be set in production");
  }
  return FALLBACK_SECRET;
}

function normalizeSessionVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// 두 base64url 서명을 상수 시간으로 비교(길이 불일치도 안전 처리).
function safeEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

interface JwtPayload {
  sub: string;
  sv: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

// ── 신규 발급: HS256 JWT ──
export function signSession(userId: string, sessionVersion: number = 1, now: number = Date.now()): string {
  const safeVersion = normalizeSessionVersion(sessionVersion);
  const iat = Math.floor(now / 1000);
  const exp = Math.floor((now + SESSION_TOKEN_TTL_MS) / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: JwtPayload = {
    sub: userId,
    sv: safeVersion,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat,
    exp,
  };
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${hmac(signingInput)}`;
}

function verifyJwt(token: string, now: number): VerifiedSessionToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, provided] = parts;
  if (!header || !body || !provided) return null;

  const expected = hmac(`${header}.${body}`);
  if (!safeEqual(provided, expected)) return null;

  let decoded: JwtPayload;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    decoded = parsed as JwtPayload;
  } catch {
    return null;
  }

  if (decoded.iss !== JWT_ISSUER || decoded.aud !== JWT_AUDIENCE) return null;
  if (typeof decoded.sub !== "string" || !decoded.sub) return null;

  const sessionVersion = Number(decoded.sv);
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) return null;

  const exp = Number(decoded.exp);
  if (!Number.isSafeInteger(exp)) return null;
  const expiresAt = exp * 1000;
  if (expiresAt <= now) return null;

  return { userId: decoded.sub, sessionVersion, expiresAt };
}

// ── 레거시 v2 HMAC 토큰 검증(만료 전까지 투명 흡수) ──
function verifyLegacyV2(token: string, now: number): VerifiedSessionToken | null {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const [, userId, rawVersion, rawExpiresAt, provided] = parts;
  if (!userId || !rawVersion || !rawExpiresAt || !provided) return null;
  const sessionVersion = Number(rawVersion);
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) return null;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

  const payload = `v2.${userId}.${sessionVersion}.${expiresAt}`;
  const expected = hmac(payload);
  if (!safeEqual(provided, expected)) return null;
  return { userId, sessionVersion, expiresAt };
}

export function verifySessionToken(
  token: string | null | undefined,
  now: number = Date.now()
): VerifiedSessionToken | null {
  if (!token || typeof token !== "string") return null;
  // 레거시 v2 는 "v2." 접두사로 구별 — 그 외는 JWT 로 검증.
  if (token.startsWith("v2.")) return verifyLegacyV2(token, now);
  return verifyJwt(token, now);
}

// 유효하면 userId, 아니면 null(만료·위조·레거시 평문 id 모두 거부).
export function verifySession(token: string | null | undefined): string | null {
  return verifySessionToken(token)?.userId ?? null;
}

// ── 세션 사용자 마이크로캐시 ──
// 토큰 검증(HMAC)은 무비용이지만, 검증된 userId 로 users 행(role·email 등)을 읽는 SELECT 가
// 인증 요청마다 DB(Neon)로 나갔다. 30초 TTL 인메모리 캐시로 흡수해 요청당 SELECT 를 대폭 줄이고
// 유휴 연결이 빨리 닫히게 한다(Neon autosuspend 유도). 캐시 키는 서명 검증을 통과한 userId
// (토큰은 userId 당 1개로 결정적이므로 토큰 키와 동치).
// 일관성: 프로필/권한 변경·로그아웃 경로에서 invalidateSessionUser 로 즉시 무효화하고,
// 그 외 변경도 최대 30초 안에 자연 수렴한다.
export const SESSION_USER_CACHE_TTL_MS = 30_000;
export const SESSION_USER_CACHE_MAX_ENTRIES = 500;

type SessionUserCacheEntry = { value: unknown; expiresAt: number };
const SESSION_USER_CACHE = new Map<string, SessionUserCacheEntry>();

// 가득 찼을 때: 만료 항목 → 가장 오래 사용되지 않은 항목(Map 앞쪽) 순으로 정리(LRU성).
function pruneSessionUserCache(now: number) {
  if (SESSION_USER_CACHE.size < SESSION_USER_CACHE_MAX_ENTRIES) return;
  for (const [key, entry] of SESSION_USER_CACHE) {
    if (entry.expiresAt <= now) SESSION_USER_CACHE.delete(key);
  }
  while (SESSION_USER_CACHE.size >= SESSION_USER_CACHE_MAX_ENTRIES) {
    const oldest = SESSION_USER_CACHE.keys().next().value;
    if (oldest === undefined) break;
    SESSION_USER_CACHE.delete(oldest);
  }
}

// 검증된 userId 의 사용자 조회를 TTL 캐시로 감싼다. loader 주입형이라 DB 없이 테스트 가능하고,
// 호출부(isAdminUser 등)의 기존 시그니처를 바꾸지 않는다. loader 실패(throw)는 캐시하지 않는다.
export async function getSessionUserCached<T>(
  userId: string,
  loader: (userId: string) => Promise<T>,
  ttlMs: number = SESSION_USER_CACHE_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = SESSION_USER_CACHE.get(userId);
  if (hit && hit.expiresAt > now) {
    // LRU 터치: 최근 사용 항목을 Map 뒤로 보내 정리 시 오래된 항목부터 빠지게 한다.
    SESSION_USER_CACHE.delete(userId);
    SESSION_USER_CACHE.set(userId, hit);
    return hit.value as T;
  }
  const value = await loader(userId);
  pruneSessionUserCache(now);
  SESSION_USER_CACHE.set(userId, { value, expiresAt: now + ttlMs });
  return value;
}

// 해당 사용자의 캐시 무효화 — 로그아웃·프로필 갱신·역할(권한) 변경 직후 호출해 즉시 반영한다.
export function invalidateSessionUser(userId: string | null | undefined): void {
  if (!userId) return;
  SESSION_USER_CACHE.delete(userId);
  for (const key of SESSION_USER_CACHE.keys()) {
    if (key.startsWith(`${userId}:`)) SESSION_USER_CACHE.delete(key);
  }
}

// 전체 무효화(테스트·비상 운영용).
export function clearSessionUserCache(): void {
  SESSION_USER_CACHE.clear();
}

// 현재 캐시 엔트리 수(테스트·관측용).
export function sessionUserCacheSize(): number {
  return SESSION_USER_CACHE.size;
}
