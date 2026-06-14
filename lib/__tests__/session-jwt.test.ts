import { createHmac } from "node:crypto";

import { describe, it, expect } from "vitest";

import { SESSION_TOKEN_TTL_MS, signSession, verifySession, verifySessionToken } from "../server/session";

const DEV_FALLBACK_SECRET = "toonspectrum-insecure-dev-session-secret";
function sessionSecret(): string {
  return process.env.AUTH_SESSION_SECRET || process.env.AUTH_STATE_SECRET || DEV_FALLBACK_SECRET;
}

// H6: HMAC 세션 → 서명 JWT 마이그레이션. 신규 토큰은 HS256 JWT, 레거시 v2 HMAC 은 만료 전까지 투명 흡수.
describe("세션 JWT(HS256) 발급/검증", () => {
  it("발급한 JWT 는 header.payload.signature 3분절이고 verify 라운드트립한다", () => {
    const token = signSession("user-123", 5);
    expect(token.split(".")).toHaveLength(3);
    expect(verifySession(token)).toBe("user-123");
    expect(verifySessionToken(token)).toMatchObject({ userId: "user-123", sessionVersion: 5 });
  });

  it("payload 는 sub/sv/iss/aud/iat/exp 를 담는다", () => {
    const token = signSession("user-payload", 3, 1_000_000_000_000);
    const [, body] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(payload).toMatchObject({
      sub: "user-payload",
      sv: 3,
      iss: "toonspectrum",
      aud: "toonspectrum-web",
    });
    expect(payload.iat).toBe(1_000_000_000);
    expect(payload.exp).toBe(Math.floor((1_000_000_000_000 + SESSION_TOKEN_TTL_MS) / 1000));
  });

  it("서명 변조 토큰은 거부한다(상수 시간 비교)", () => {
    const token = signSession("user-tamper", 1);
    const [h, p, sig] = token.split(".");
    expect(verifySession(`${h}.${p}.${sig.slice(0, -2)}xy`)).toBeNull();
    // payload 변조 → 서명 불일치
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "attacker", sv: 1, iss: "toonspectrum", aud: "toonspectrum-web", iat: 1, exp: 9_999_999_999 })).toString("base64url");
    expect(verifySession(`${h}.${forgedPayload}.${sig}`)).toBeNull();
  });

  it("iss/aud 불일치 토큰은 (서명이 유효해도) 거부한다(토큰 혼용·재사용 방지)", () => {
    // 올바른 비밀로 '제대로 서명된' 토큰이지만 aud 가 다르면 거부돼야 한다(서명 검증을 통과한 뒤 claim 검증).
    const secret = sessionSecret();
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ sub: "user-aud", sv: 1, iss: "toonspectrum", aud: "someone-else", iat: 1, exp: 9_999_999_999 })).toString("base64url");
    const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    expect(verifySession(`${header}.${body}.${sig}`)).toBeNull();

    // iss 가 다른 경우도 동일하게 거부.
    const body2 = Buffer.from(JSON.stringify({ sub: "user-iss", sv: 1, iss: "evil", aud: "toonspectrum-web", iat: 1, exp: 9_999_999_999 })).toString("base64url");
    const sig2 = createHmac("sha256", secret).update(`${header}.${body2}`).digest("base64url");
    expect(verifySession(`${header}.${body2}.${sig2}`)).toBeNull();
  });

  it("만료된 JWT 는 거부한다", () => {
    const token = signSession("user-exp", 1, 0); // iat=0
    expect(verifySessionToken(token, SESSION_TOKEN_TTL_MS - 5_000)).toMatchObject({ userId: "user-exp" });
    expect(verifySessionToken(token, SESSION_TOKEN_TTL_MS + 5_000)).toBeNull();
  });

  it("레거시 평문 id·비-JWT 문자열은 거부한다", () => {
    expect(verifySession("user-123")).toBeNull();
    expect(verifySession("user-123.fake")).toBeNull(); // v1 결정적 토큰
    expect(verifySession("garbage.token.value")).toBeNull(); // 임의 3분절(서명 불일치)
    expect(verifySession(null)).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});

describe("레거시 v2 HMAC 토큰 투명 흡수(락아웃 방지)", () => {
  // 기존 발급된 v2 토큰("v2.<userId>.<sv>.<exp>.<sig>")이 만료 전까지 그대로 검증돼야
  // HMAC→JWT 전환 중 재로그인 강제(락아웃) 없이 흡수된다.
  function makeV2(userId: string, sv: number, expiresAt: number): string {
    // session.ts 와 동일한 비밀(개발 폴백)·payload·HMAC 으로 v2 토큰을 합성한다.
    const payload = `v2.${userId}.${sv}.${expiresAt}`;
    const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  it("유효한 v2 토큰은 여전히 검증된다(실시간·고정시각 모두)", () => {
    const now = 1_700_000_000_000;
    const future = Date.now() + 60_000; // 실시간 verifySession 도 통과하도록 미래 만료
    const token = makeV2("legacy-user", 2, future);
    expect(verifySessionToken(token, now)).toMatchObject({ userId: "legacy-user", sessionVersion: 2 });
    expect(verifySession(token)).toBe("legacy-user");
  });

  it("만료된 v2 토큰은 거부된다", () => {
    const now = 1_700_000_000_000;
    const token = makeV2("legacy-expired", 1, now - 1);
    expect(verifySessionToken(token, now)).toBeNull();
  });

  it("서명이 변조된 v2 토큰은 거부된다", () => {
    const now = 1_700_000_000_000;
    const token = makeV2("legacy-tamper", 1, now + 60_000);
    expect(verifySessionToken(`${token.slice(0, -2)}xy`, now)).toBeNull();
  });
});
