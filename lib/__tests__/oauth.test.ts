import { describe, it, expect } from "vitest";
import { issueState, verifyState, isOAuthProvider, providerMode, listAuthProviders } from "../server/oauth";

describe("OAuth signed state (CSRF 방어)", () => {
  it("발급한 state는 같은 provider로 검증 통과", () => {
    const s = issueState("google");
    expect(verifyState("google", s)).toBe(true);
  });

  it("다른 provider로는 검증 실패(혼용 방지)", () => {
    const s = issueState("google");
    expect(verifyState("kakao", s)).toBe(false);
  });

  it("변조된 state는 서명 불일치로 실패", () => {
    const s = issueState("kakao");
    expect(verifyState("kakao", s.slice(0, -2) + "xy")).toBe(false);
    expect(verifyState("kakao", "garbage")).toBe(false);
    expect(verifyState("kakao", undefined)).toBe(false);
  });

  it("TTL 경과 state는 실패", () => {
    const s = issueState("google");
    expect(verifyState("google", s, 0)).toBe(false); // maxAge 0 → 즉시 만료
  });
});

describe("OAuth provider 유틸", () => {
  it("isOAuthProvider는 google/kakao만 허용", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("kakao")).toBe(true);
    expect(isOAuthProvider("naver")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
  });

  it("client id/secret 미설정 시 demo 모드", () => {
    // 테스트 환경엔 OAuth 환경변수가 없으므로 둘 다 demo여야 한다.
    expect(providerMode("google")).toBe("demo");
    expect(providerMode("kakao")).toBe("demo");
    const list = listAuthProviders();
    expect(list.google.mode).toBe("demo");
    expect(list.kakao.mode).toBe("demo");
  });
});
