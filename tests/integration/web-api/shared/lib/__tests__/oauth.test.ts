import { generateKeyPairSync, sign as signPayload } from "node:crypto";

import { afterEach, describe, it, expect, vi } from "vitest";

import {
  appleNonceForState,
  buildAuthorizeUrl,
  canAutoLinkOAuthEmail,
  createAppleClientSecret,
  createPkceCodeChallenge,
  handleOAuthCallback,
  isAuthorizationCodeFlowConfigured,
  issuePkceVerifier,
  issueState,
  verifyBrowserBoundState,
  verifyState,
  isOAuthProvider,
  providerMode,
  listAuthProviders,
  parseAppleUserName,
  selectGitHubVerifiedEmail,
  verifyAppleIdentityToken,
} from "../../../../../../apps/api/src/server/oauth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

  it("서명 state도 같은 브라우저의 HttpOnly 상태값과 일치해야 통과한다", () => {
    const state = issueState("github");
    const otherBrowserState = issueState("github");

    expect(verifyBrowserBoundState("github", state, state)).toBe(true);
    expect(verifyBrowserBoundState("github", state, null)).toBe(false);
    expect(
      verifyBrowserBoundState("github", state, otherBrowserState),
    ).toBe(false);
  });

  it("TTL 경과 state는 실패", () => {
    const s = issueState("google");
    expect(verifyState("google", s, 0)).toBe(false); // maxAge 0 → 즉시 만료
  });

  it("운영에서는 누락·약함·공백 패딩 state HMAC 비밀을 거부한다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_STATE_SECRET", "");
    expect(() => issueState("google")).toThrow(
      /AUTH_STATE_SECRET must be set/u,
    );

    vi.stubEnv("AUTH_STATE_SECRET", "short");
    expect(() => issueState("google")).toThrow(/32 UTF-8 bytes/u);

    vi.stubEnv(
      "AUTH_STATE_SECRET",
      " production-state-secret-with-at-least-32-bytes ",
    );
    expect(() => issueState("google")).toThrow(/unpadded secret/u);
  });

  it("운영의 강한 state HMAC 비밀은 인스턴스 독립 검증 계약을 유지한다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "AUTH_STATE_SECRET",
      "production-state-secret-with-at-least-32-bytes",
    );

    const state = issueState("google");
    expect(verifyState("google", state)).toBe(true);
  });
});

describe("OAuth provider 유틸", () => {
  it("isOAuthProvider는 google/apple/kakao/naver/github만 허용하고 폐기된 Toss 인증은 거부", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("apple")).toBe(true);
    expect(isOAuthProvider("kakao")).toBe(true);
    expect(isOAuthProvider("naver")).toBe(true);
    expect(isOAuthProvider("github")).toBe(true);
    expect(isOAuthProvider("toss")).toBe(false);
    expect(isOAuthProvider("")).toBe(false);
  });

  it("자격 증명이 없는 공급자는 운영과 기본 개발 환경에서 안전하게 비활성화한다", () => {
    expect(providerMode("google")).toBe("disabled");
    expect(providerMode("apple")).toBe("disabled");
    expect(providerMode("github")).toBe("disabled");
    expect(providerMode("kakao")).toBe("disabled");
    expect(providerMode("naver")).toBe("disabled");
    const list = listAuthProviders();
    expect(list.google.mode).toBe("disabled");
    expect(list.apple).toMatchObject({
      mode: "disabled",
      reason: "missing-credentials",
      redirectAvailable: false,
    });
    expect(list.github).toMatchObject({
      mode: "disabled",
      reason: "missing-credentials",
      redirectAvailable: false,
    });
    expect(list.kakao).toBeUndefined();
    expect(list.naver).toBeUndefined();
    const enabled = listAuthProviders({ kakao: true, naver: true });
    expect(enabled.kakao?.mode).toBe("disabled");
    expect(enabled.naver?.mode).toBe("disabled");
  });

  it("데모 로그인은 비운영 환경의 명시적 opt-in에서만 허용한다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SOCIAL_DEMO_ENABLED", "true");
    expect(providerMode("kakao")).toBe("demo");
    expect(providerMode("naver")).toBe("demo");

    vi.stubEnv("NODE_ENV", "production");
    expect(providerMode("kakao")).toBe("disabled");
    expect(providerMode("naver")).toBe("disabled");
  });

  it("GIS client ID만 있는 Google 구성은 redirect code-flow로 오인하지 않는다", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");

    expect(providerMode("google")).toBe("oauth");
    expect(isAuthorizationCodeFlowConfigured("google")).toBe(false);
    expect(listAuthProviders().google.redirectAvailable).toBe(false);
    expect(buildAuthorizeUrl("google", "unused-state")).toBeNull();
  });

  it("Google redirect code-flow는 client ID와 secret이 모두 있을 때만 URL을 만든다", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "123-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "configured-secret");
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");

    expect(isAuthorizationCodeFlowConfigured("google")).toBe(true);
    expect(listAuthProviders().google.redirectAvailable).toBe(true);
    const url = new URL(buildAuthorizeUrl("google", "signed-state")!);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.toonstudio.cloud/api/auth/oauth/google/callback",
    );
    expect(url.searchParams.get("state")).toBe("signed-state");
  });

  it("Apple OAuth는 Services ID·form_post·nonce와 ES256 client-secret을 사용한다", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    vi.stubEnv("APPLE_SERVICE_ID", "cloud.toonstudio.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAMID1234");
    vi.stubEnv("APPLE_KEY_ID", "KEYID12345");
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");

    expect(providerMode("apple")).toBe("oauth");
    expect(isAuthorizationCodeFlowConfigured("apple")).toBe(true);
    const url = new URL(buildAuthorizeUrl("apple", "apple-state")!);
    expect(url.origin).toBe("https://appleid.apple.com");
    expect(url.pathname).toBe("/auth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.toonstudio.cloud/api/auth/oauth/apple/callback",
    );
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("scope")).toBe("name email");
    expect(url.searchParams.get("nonce")).toBe(appleNonceForState("apple-state"));

    const secret = createAppleClientSecret(1_800_000_000_000);
    const [, payloadPart] = secret.split(".");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    expect(payload).toMatchObject({
      iss: "TEAMID1234",
      aud: "https://appleid.apple.com",
      sub: "cloud.toonstudio.web",
    });
  });

  it("Apple ID token은 JWKS 서명·issuer·audience·nonce를 모두 검증한다", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("APPLE_SERVICE_ID", "cloud.toonstudio.web");
    const state = "apple-browser-bound-state";
    const now = 1_800_000_000_000;
    const headerPart = Buffer.from(JSON.stringify({ alg: "RS256", kid: "APPLEKEY01" })).toString("base64url");
    const payloadPart = Buffer.from(JSON.stringify({
      iss: "https://appleid.apple.com",
      aud: "cloud.toonstudio.web",
      sub: "apple-team-user-123",
      iat: Math.floor(now / 1000) - 10,
      exp: Math.floor(now / 1000) + 300,
      nonce: appleNonceForState(state),
      email: "PRIVATE@privaterelay.appleid.com",
      email_verified: "true",
    })).toString("base64url");
    const signingInput = `${headerPart}.${payloadPart}`;
    const signature = signPayload(
      "RSA-SHA256",
      Buffer.from(signingInput, "ascii"),
      privateKey,
    ).toString("base64url");
    const jwk = publicKey.export({ format: "jwk" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [{ ...jwk, kid: "APPLEKEY01", alg: "RS256", use: "sig" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(verifyAppleIdentityToken(`${signingInput}.${signature}`, state, now)).resolves.toMatchObject({
      providerAccountId: "apple-team-user-123",
      email: "private@privaterelay.appleid.com",
      emailVerified: true,
    });
    expect(parseAppleUserName(JSON.stringify({
      name: { firstName: " Hee ", lastName: " Jun\u0000Kim " },
    }))).toBe("Hee Jun Kim");
  });

  it("GitHub OAuth는 최소 이메일 범위·PKCE와 정확한 callback을 사용한다", () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    vi.stubEnv("OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");

    expect(providerMode("github")).toBe("oauth");
    expect(isAuthorizationCodeFlowConfigured("github")).toBe(true);
    const verifier = issuePkceVerifier();
    const challenge = createPkceCodeChallenge(verifier);
    expect(buildAuthorizeUrl("github", "github-state")).toBeNull();
    const url = new URL(
      buildAuthorizeUrl("github", "github-state", {
        pkceCodeChallenge: challenge,
      })!,
    );
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://www.toonstudio.cloud/api/auth/oauth/github/callback",
    );
    expect(url.searchParams.get("scope")).toBe("user:email");
    expect(url.searchParams.get("state")).toBe("github-state");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("Kakao는 승인된 최소 프로필 scope만 기본 요청하고 이메일은 명시적으로 opt-in한다", () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "kakao-rest-key");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    expect(providerMode("kakao")).toBe("disabled");
    expect(isAuthorizationCodeFlowConfigured("kakao")).toBe(false);

    vi.stubEnv("KAKAO_CLIENT_SECRET", "kakao-client-secret");
    let url = new URL(buildAuthorizeUrl("kakao", "kakao-state")!);
    expect(providerMode("kakao")).toBe("oauth");
    expect(url.searchParams.get("scope")).toBe(
      "profile_nickname,profile_image",
    );

    vi.stubEnv("KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED", "true");
    url = new URL(buildAuthorizeUrl("kakao", "kakao-state")!);
    expect(url.searchParams.get("scope")).toBe(
      "profile_nickname,profile_image,account_email",
    );
  });

  it("Naver token 교환에는 검증한 callback state를 다시 포함한다", async () => {
    vi.stubEnv("NAVER_OAUTH_CLIENT_ID", "naver-client-id");
    vi.stubEnv("NAVER_OAUTH_CLIENT_SECRET", "naver-client-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      handleOAuthCallback("naver", "authorization-code", "verified-state"),
    ).rejects.toThrow("no access_token");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    expect((request?.body as URLSearchParams).get("state")).toBe(
      "verified-state",
    );
  });

  it("GitHub token 교환에는 브라우저에 묶인 PKCE verifier를 포함한다", async () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "github-client-id");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "github-client-secret");
    const verifier = issuePkceVerifier();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      handleOAuthCallback(
        "github",
        "authorization-code",
        "verified-state",
        verifier,
      ),
    ).rejects.toThrow("no access_token");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    expect((request?.body as URLSearchParams).get("code_verifier")).toBe(
      verifier,
    );
  });

  it("모든 제공자 이메일은 검증 여부와 무관하게 자동 계정 병합에 사용하지 않는다", () => {
    expect(canAutoLinkOAuthEmail("naver", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("naver", false)).toBe(false);
    expect(canAutoLinkOAuthEmail("google", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("apple", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("kakao", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("github", true)).toBe(false);
  });

  it("GitHub 이메일은 primary verified를 우선하고 미검증 주소를 거부한다", () => {
    expect(
      selectGitHubVerifiedEmail([
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "PRIMARY@EXAMPLE.COM", primary: true, verified: true },
        { email: "unsafe@example.com", primary: true, verified: false },
      ]),
    ).toBe("primary@example.com");
    expect(
      selectGitHubVerifiedEmail([
        { email: "unsafe@example.com", primary: true, verified: false },
      ]),
    ).toBeNull();
  });
});
