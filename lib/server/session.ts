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
