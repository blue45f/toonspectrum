import { describe, expect, it } from "vitest";

import {
  isAuthMutationRequest,
  isAllowedCsrfOrigin,
  isSameRequestOrigin,
} from "./csrf-middleware";

const PRODUCTION_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  API_CORS_ALLOWED_ORIGINS: "https://app.toonspectrum.example",
};

describe("CSRF Origin policy", () => {
  it("accepts the exact request Origin or an explicitly configured Origin", () => {
    const request = { headers: { host: "api.toonspectrum.example" } } as never;

    expect(
      isSameRequestOrigin(
        "https://api.toonspectrum.example",
        request,
        PRODUCTION_ENV,
      ),
    ).toBe(true);
    expect(
      isAllowedCsrfOrigin(
        "https://app.toonspectrum.example",
        PRODUCTION_ENV,
      ),
    ).toBe(true);
  });

  it("rejects lookalikes, noncanonical values, and production HTTP", () => {
    const request = { headers: { host: "api.toonspectrum.example" } } as never;

    expect(
      isSameRequestOrigin(
        "https://api.toonspectrum.example.evil.test",
        request,
        PRODUCTION_ENV,
      ),
    ).toBe(false);
    expect(
      isSameRequestOrigin(
        "https://api.toonspectrum.example/path",
        request,
        PRODUCTION_ENV,
      ),
    ).toBe(false);
    expect(
      isSameRequestOrigin(
        "http://api.toonspectrum.example",
        request,
        PRODUCTION_ENV,
      ),
    ).toBe(false);
    expect(
      isAllowedCsrfOrigin(
        "https://app.toonspectrum.example/",
        PRODUCTION_ENV,
      ),
    ).toBe(false);
  });
});

describe("auth mutation path recognition", () => {
  it("recognizes direct, trailing-slash, and Vercel query-path auth requests", () => {
    expect(
      isAuthMutationRequest({
        path: "/api/auth/login",
        originalUrl: "/api/auth/login",
        query: {},
      } as never),
    ).toBe(true);
    expect(
      isAuthMutationRequest({
        path: "/api/auth/oauth/kakao/demo/",
        originalUrl: "/api/auth/oauth/kakao/demo/",
        query: {},
      } as never),
    ).toBe(true);
    expect(
      isAuthMutationRequest({
        path: "/API/AUTH/LOGIN",
        originalUrl: "/API/AUTH/LOGIN",
        query: {},
      } as never),
    ).toBe(true);
    expect(
      isAuthMutationRequest({
        path: "/api/index",
        originalUrl: "/api/index?path=auth%2Foauth%2Fexchange",
        query: { path: "auth/oauth/exchange" },
      } as never),
    ).toBe(true);
  });

  it("does not widen the anonymous mutation boundary outside auth", () => {
    expect(
      isAuthMutationRequest({
        path: "/api/community/posts",
        originalUrl: "/api/community/posts",
        query: {},
      } as never),
    ).toBe(false);
  });
});
