import { describe, expect, it, vi } from "vitest";

import {
  parseSocialLoginOrigin,
  validateSocialLoginDiscovery,
  verifySocialLoginProduction,
} from "./verify-social-login-production.mjs";

const ORIGIN = "https://www.toonstudio.cloud";

function discovery(overrides = {}) {
  return {
    google: {
      label: "Google",
      mode: "oauth",
      redirectAvailable: false,
      clientId: "123-example.apps.googleusercontent.com",
    },
    apple: {
      label: "Apple",
      mode: "oauth",
      redirectAvailable: true,
    },
    kakao: {
      label: "카카오",
      mode: "oauth",
      redirectAvailable: true,
    },
    naver: {
      label: "네이버",
      mode: "oauth",
      redirectAvailable: true,
    },
    github: {
      label: "GitHub",
      mode: "oauth",
      redirectAvailable: true,
    },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function oauthCookie(provider, { includePkce = false } = {}) {
  const sameSite = provider === "apple" ? "None" : "Lax";
  const attributes = `Path=/api/auth/oauth/${provider}; HttpOnly; Secure; SameSite=${sameSite}`;
  const values = [
    `toonspectrum-oauth-state-${provider}=signed-state; ${attributes}`,
  ];
  if (includePkce) {
    values.push(`toonspectrum-oauth-pkce-${provider}=verifier; ${attributes}`);
  }
  return values.join(", ");
}

function authorizeUrl(provider, options = {}) {
  const endpoints = {
    apple: "https://appleid.apple.com/auth/authorize",
    kakao: "https://kauth.kakao.com/oauth/authorize",
    naver: "https://nid.naver.com/oauth2.0/authorize",
    github: "https://github.com/login/oauth/authorize",
  };
  const url = new URL(endpoints[provider]);
  url.searchParams.set("client_id", `${provider}-client`);
  url.searchParams.set(
    "redirect_uri",
    `${ORIGIN}/api/auth/oauth/${provider}/callback`,
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", "signed-state");

  if (provider === "apple") {
    url.searchParams.set("scope", "name email");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("nonce", "a".repeat(43));
  }
  if (provider === "kakao") {
    url.searchParams.set(
      "scope",
      options.kakaoScope ?? "profile_nickname,profile_image",
    );
  }
  if (provider === "github") {
    url.searchParams.set("scope", "user:email");
    if (!options.omitPkce) {
      url.searchParams.set("code_challenge", "a".repeat(43));
      url.searchParams.set("code_challenge_method", "S256");
    }
  }
  if (options.hostname) url.hostname = options.hostname;
  return url.toString();
}

function redirectResponse(provider, options = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl(provider, options),
      "set-cookie": oauthCookie(provider, {
        includePkce: provider === "github" && !options.omitPkceCookie,
      }),
    },
  });
}

function productionFetch(options = {}) {
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/auth/providers") {
      return jsonResponse(options.discovery ?? discovery());
    }
    for (const provider of ["apple", "kakao", "naver", "github"]) {
      if (url.pathname === `/api/auth/oauth/${provider}/start`) {
        return redirectResponse(provider, options[provider]);
      }
    }
    return jsonResponse({ error: "not_found" }, 404);
  });
}

describe("social login production verification", () => {
  it("accepts five configured providers and secure authorization redirects", async () => {
    const fetchImpl = productionFetch();

    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl,
      timeoutMs: 5_000,
    })).resolves.toMatchObject({
      origin: ORIGIN,
      discovery: {
        google: { mode: "oauth", redirectAvailable: false },
        apple: { mode: "oauth", redirectAvailable: true },
        kakao: { mode: "oauth", redirectAvailable: true },
        naver: { mode: "oauth", redirectAvailable: true },
        github: { mode: "oauth", redirectAvailable: true },
      },
      redirects: [
        { provider: "apple", status: 302, authorizationHost: "appleid.apple.com" },
        { provider: "kakao", status: 302, authorizationHost: "kauth.kakao.com" },
        { provider: "naver", status: 302, authorizationHost: "nid.naver.com" },
        { provider: "github", status: 302, authorizationHost: "github.com" },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("rejects a provider that is hidden or disabled", async () => {
    const fetchImpl = productionFetch({
      discovery: discovery({
        naver: {
          label: "네이버",
          mode: "disabled",
          redirectAvailable: false,
          reason: "missing-credentials",
        },
      }),
    });

    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl,
      timeoutMs: 5_000,
    })).rejects.toThrow("naver.mode must be oauth");
  });

  it("rejects sensitive fields in public provider discovery", () => {
    expect(() => validateSocialLoginDiscovery(discovery({
      github: {
        label: "GitHub",
        mode: "oauth",
        redirectAvailable: true,
        clientSecret: "must-never-be-public",
      },
    }))).toThrow("exposes a sensitive field");
  });

  it("rejects an authorization redirect to an untrusted host", async () => {
    const fetchImpl = productionFetch({
      kakao: { hostname: "login.attacker.test" },
    });

    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl,
      timeoutMs: 5_000,
    })).rejects.toThrow("kakao redirects to an unexpected authorization endpoint");
  });

  it("requires Apple form_post, nonce, and SameSite=None state cookie", async () => {
    const fetchImpl = productionFetch({ apple: { } });
    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl,
      timeoutMs: 5_000,
    })).resolves.toBeDefined();
  });

  it("requires GitHub PKCE and its browser-bound verifier cookie", async () => {
    const missingChallenge = productionFetch({ github: { omitPkce: true } });
    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl: missingChallenge,
      timeoutMs: 5_000,
    })).rejects.toThrow("github authorize URL must use S256 PKCE");

    const missingCookie = productionFetch({ github: { omitPkceCookie: true } });
    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl: missingCookie,
      timeoutMs: 5_000,
    })).rejects.toThrow("missing toonspectrum-oauth-pkce-github");
  });

  it("keeps Kakao email scope disabled until provider approval", async () => {
    const fetchImpl = productionFetch({
      kakao: { kakaoScope: "profile_nickname,profile_image,account_email" },
    });

    await expect(verifySocialLoginProduction({
      origin: ORIGIN,
      fetchImpl,
      timeoutMs: 5_000,
    })).rejects.toThrow("requests account_email without approval");
  });

  it.each([
    "",
    "http://www.toonstudio.cloud",
    "https://user:pass@www.toonstudio.cloud",
    "https://www.toonstudio.cloud/path",
    "https://www.toonstudio.cloud?query=1",
    "https://www.toonstudio.cloud/#fragment",
  ])("rejects an unsafe production origin: %s", (origin) => {
    expect(() => parseSocialLoginOrigin(origin)).toThrow();
  });
});
