import { describe, expect, it, vi } from "vitest";

import { validateEnv } from "./env";

describe("production domain environment validation", () => {
  it("accepts the canonical Toon Studio host and OAuth/web origins", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      CANONICAL_HOST: "www.toonstudio.cloud",
      OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
      WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
      API_CORS_ALLOWED_ORIGINS:
        "https://www.toonstudio.cloud,https://toonstudio.cloud",
    }, logger)).toMatchObject({
      CANONICAL_HOST: "www.toonstudio.cloud",
      OAUTH_REDIRECT_BASE_URL: "https://www.toonstudio.cloud",
      WEB_APP_BASE_URL: "https://www.toonstudio.cloud",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns non-fatally when CANONICAL_HOST contains a scheme or path", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      CANONICAL_HOST: "https://www.toonstudio.cloud/path",
    }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("Studio AI quota environment validation", () => {
  it("accepts positive distributed quota overrides", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_AI_DAILY_REQUEST_LIMIT: "25",
        STUDIO_AI_DAILY_TOKEN_LIMIT: "75000",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_AI_DAILY_REQUEST_LIMIT: "25",
      STUDIO_AI_DAILY_TOKEN_LIMIT: "75000",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns non-fatally for zero or nonnumeric quota values", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_AI_DAILY_REQUEST_LIMIT: "0",
          STUDIO_AI_DAILY_TOKEN_LIMIT: "unlimited",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("Studio live cluster environment validation", () => {
  it("accepts explicit PostgreSQL adapter settings without logging the direct URL", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-direct.example.net/toonspectrum?sslmode=require",
        STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
        STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "false",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
      STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "false",
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(
      JSON.stringify({
        errors: logger.error.mock.calls,
        warnings: logger.warn.mock.calls,
      })
    ).not.toContain("artist:secret");
  });

  it("warns non-fatally for an unsupported adapter mode or unbounded pool", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_LIVE_CLUSTER_ADAPTER: "redis",
          STUDIO_LIVE_POSTGRES_POOL_MAX: "1000",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("warns non-fatally for a non-canonical inline binary rollout switch", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(
      validateEnv(
        {
          NODE_ENV: "test",
          STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: "TRUE",
        },
        logger
      )
    ).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("Studio voice TURN environment validation", () => {
  it("accepts the explicit recurring-cost voice feature switch", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      STUDIO_LIVE_VOICE_ENABLED: "false",
    }, logger)).toMatchObject({ STUDIO_LIVE_VOICE_ENABLED: "false" });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("accepts TURN settings while keeping the shared secret out of diagnostics", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const secret = "voice-turn-secret-at-least-thirty-two-characters";

    const result = validateEnv(
      {
        NODE_ENV: "test",
        STUDIO_VOICE_STUN_URLS: "stun:voice.example.com:3478",
        STUDIO_VOICE_TURN_URLS:
          "turn:voice.example.com:3478?transport=udp,turns:voice.example.com:5349?transport=tcp",
        STUDIO_VOICE_TURN_SHARED_SECRET: secret,
        STUDIO_VOICE_TURN_REQUIRED: "true",
        STUDIO_VOICE_TURN_TTL_SECONDS: "900",
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_VOICE_TURN_REQUIRED: "true",
      STUDIO_VOICE_TURN_TTL_SECONDS: "900",
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(JSON.stringify(logger)).not.toContain(secret);
  });

  it("warns non-fatally for a weak shared secret in the generic env audit", () => {
    const logger = { warn: vi.fn(), error: vi.fn() };

    expect(validateEnv({
      NODE_ENV: "test",
      STUDIO_VOICE_TURN_SHARED_SECRET: "weak",
    }, logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
