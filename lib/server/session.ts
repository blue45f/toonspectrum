import { createHmac, timingSafeEqual } from "crypto";

// 서명 세션 토큰 — 클라이언트가 보내는 신원(x-user-id)을 서버 비밀로 검증한다.
// 토큰 형식: "<userId>.<base64url(HMAC-SHA256(userId))>". 비밀 없이는 위조 불가.
// (localStorage의 평문 userId를 그대로 신뢰하던 기존 방식의 가장(impersonation) 취약점 해소.)

const FALLBACK_SECRET = "toonspectrum-insecure-dev-session-secret";

function secret(): string {
  // 운영에선 AUTH_SESSION_SECRET(없으면 기존 AUTH_STATE_SECRET) 사용. 로컬 개발용 폴백만 별도.
  return process.env.AUTH_SESSION_SECRET || process.env.AUTH_STATE_SECRET || FALLBACK_SECRET;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function signSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

// 유효하면 userId, 아니면 null(만료·위조·레거시 평문 id 모두 거부).
export function verifySession(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(userId);
  if (provided.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
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
}

// 전체 무효화(테스트·비상 운영용).
export function clearSessionUserCache(): void {
  SESSION_USER_CACHE.clear();
}

// 현재 캐시 엔트리 수(테스트·관측용).
export function sessionUserCacheSize(): number {
  return SESSION_USER_CACHE.size;
}
