import { describe, expect, it, vi } from "vitest";

import { validateEnv } from "./env";

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
      },
      logger
    );

    expect(result).toMatchObject({
      STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
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
});
