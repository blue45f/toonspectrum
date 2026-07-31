import { describe, expect, it } from "vitest";

import {
  HealthLiveResponseSchema,
  HealthNotReadyResponseSchema,
  HealthReadyResponseSchema,
} from "./health.dto";

describe("health response contracts", () => {
  it("accepts only the minimal live and ready envelopes", () => {
    expect(HealthLiveResponseSchema.parse({ status: "ok" })).toEqual({
      status: "ok",
    });
    expect(HealthReadyResponseSchema.parse({ status: "ready" })).toEqual({
      status: "ready",
    });
    expect(
      HealthLiveResponseSchema.safeParse({ status: "ok", database: "ok" })
        .success,
    ).toBe(false);
  });

  it("keeps the public failure response generic and secret-free", () => {
    expect(
      HealthNotReadyResponseSchema.parse({
        statusCode: 503,
        status: "not_ready",
        error: "service_not_ready",
        message: "Service is not ready",
      }),
    ).toEqual({
      statusCode: 503,
      status: "not_ready",
      error: "service_not_ready",
      message: "Service is not ready",
    });
    expect(
      HealthNotReadyResponseSchema.safeParse({
        statusCode: 503,
        status: "not_ready",
        error: "password authentication failed",
        message: "postgresql://user:secret@example.invalid/database",
      }).success,
    ).toBe(false);
  });
});
