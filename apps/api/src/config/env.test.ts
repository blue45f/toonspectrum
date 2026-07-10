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
