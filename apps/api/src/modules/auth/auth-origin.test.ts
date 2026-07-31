import { describe, expect, it } from "vitest";

import { isAllowedAuthRequestOrigin } from "./auth-origin";

describe("Google 로그인 요청 Origin 경계", () => {
  const env = {
    NODE_ENV: "production",
    API_CORS_ALLOWED_ORIGINS: "https://preview.toonstudio.example",
  };

  it("정본·apex·명시 구성 Origin만 허용한다", () => {
    expect(isAllowedAuthRequestOrigin("https://www.toonstudio.cloud", env)).toBe(true);
    expect(isAllowedAuthRequestOrigin("https://toonstudio.cloud", env)).toBe(true);
    expect(isAllowedAuthRequestOrigin("https://preview.toonstudio.example", env)).toBe(true);
  });

  it("유사 도메인, 경로가 붙은 값, null Origin은 거부한다", () => {
    expect(isAllowedAuthRequestOrigin("https://www.toonstudio.cloud.evil.example", env)).toBe(false);
    expect(isAllowedAuthRequestOrigin("https://www.toonstudio.cloud/login", env)).toBe(false);
    expect(isAllowedAuthRequestOrigin("null", env)).toBe(false);
  });

  it("production에서는 명시 allowlist에 있어도 평문 HTTP Origin을 거부한다", () => {
    const insecureEnv = {
      ...env,
      API_CORS_ALLOWED_ORIGINS:
        "https://preview.toonstudio.example,http://preview.toonstudio.example",
    };

    expect(
      isAllowedAuthRequestOrigin(
        "http://preview.toonstudio.example",
        insecureEnv,
      ),
    ).toBe(false);
  });

  it("서버 간 요청처럼 Origin 헤더가 없으면 토큰 검증 단계로 넘긴다", () => {
    expect(isAllowedAuthRequestOrigin(undefined, env)).toBe(true);
  });
});
