import { describe, expect, it } from "vitest";

import {
  AuthRateLimitConfigurationError,
  resolveAuthRateLimitConfig,
} from "./auth-rate-limit.config";

describe("auth rate-limit deployment mode", () => {
  it("development와 test는 Upstash가 없을 때 bounded local fallback을 유지한다", () => {
    expect(resolveAuthRateLimitConfig({})).toEqual({ distributed: false });
    expect(
      resolveAuthRateLimitConfig({
        UPSTASH_COORDINATION_ENABLED: "false",
      }),
    ).toEqual({ distributed: false });
    expect(resolveAuthRateLimitConfig({ AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "" })).toEqual(
      { distributed: false },
    );
    expect(resolveAuthRateLimitConfig({ AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false" })).toEqual(
      { distributed: false },
    );
  });

  it("production은 rate-limit topology가 없으면 fail closed한다", () => {
    expect(() => resolveAuthRateLimitConfig({ NODE_ENV: "production" }))
      .toThrow(AuthRateLimitConfigurationError);
    expect(() => resolveAuthRateLimitConfig({
      NODE_ENV: "production",
      AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
    })).toThrow(AuthRateLimitConfigurationError);
  });

  it("production single-instance local은 이름으로 위험을 명시해야 한다", () => {
    expect(resolveAuthRateLimitConfig({
      NODE_ENV: "production",
      AUTH_RATE_LIMIT_MODE: "single-instance-local",
    })).toEqual({ distributed: false });
  });

  it("UPSTASH가 활성화되어 있으면 기본값으로 분산 제한이 활성화된다", () => {
    expect(
      resolveAuthRateLimitConfig({
        UPSTASH_COORDINATION_ENABLED: "true",
        UPSTASH_COORDINATION_REST_URL: "https://example.com",
        UPSTASH_COORDINATION_REST_TOKEN: "a".repeat(16),
        UPSTASH_COORDINATION_KEY_HASH_SECRET: "b".repeat(32),
        UPSTASH_COORDINATION_NAMESPACE: "test",
      }),
    ).toEqual({ distributed: true });
  });

  it("명시적으로 true는 분산 제한을 활성화한다", () => {
    expect(
      resolveAuthRateLimitConfig({
        AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "true",
        UPSTASH_COORDINATION_ENABLED: "true",
        UPSTASH_COORDINATION_REST_URL: "https://example.com",
        UPSTASH_COORDINATION_REST_TOKEN: "a".repeat(16),
        UPSTASH_COORDINATION_KEY_HASH_SECRET: "b".repeat(32),
        UPSTASH_COORDINATION_NAMESPACE: "test",
      }),
    ).toEqual({ distributed: true });
  });

  it("production distributed는 canonical mode와 Upstash를 모두 요구한다", () => {
    expect(() => resolveAuthRateLimitConfig({
      NODE_ENV: "production",
      AUTH_RATE_LIMIT_MODE: "distributed",
    })).toThrow(AuthRateLimitConfigurationError);
    expect(resolveAuthRateLimitConfig({
      NODE_ENV: "production",
      AUTH_RATE_LIMIT_MODE: "distributed",
      UPSTASH_COORDINATION_ENABLED: "true",
      UPSTASH_COORDINATION_REST_URL: "https://example.com",
      UPSTASH_COORDINATION_REST_TOKEN: "a".repeat(16),
      UPSTASH_COORDINATION_KEY_HASH_SECRET: "b".repeat(32),
      UPSTASH_COORDINATION_NAMESPACE: "test",
    })).toEqual({ distributed: true });
  });

  it("분산 인프라가 비활성화 상태에서 true를 요청하면 설정 예외", () => {
    expect(() =>
      resolveAuthRateLimitConfig({ AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "true" }),
    ).toThrow(AuthRateLimitConfigurationError);
  });

  it("잘못된 값이면 설정 예외를 던진다", () => {
    expect(() =>
      resolveAuthRateLimitConfig({ AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "1" }),
    ).toThrow(AuthRateLimitConfigurationError);
    expect(() =>
      resolveAuthRateLimitConfig({ AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "TRUE" }),
    ).toThrow(AuthRateLimitConfigurationError);
    expect(() =>
      resolveAuthRateLimitConfig({ AUTH_RATE_LIMIT_MODE: "local" }),
    ).toThrow(AuthRateLimitConfigurationError);
    expect(() =>
      resolveAuthRateLimitConfig({
        AUTH_RATE_LIMIT_MODE: "distributed",
        AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
      }),
    ).toThrow(AuthRateLimitConfigurationError);
  });
});
