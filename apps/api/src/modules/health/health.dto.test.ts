import { describe, expect, it } from "vitest";

import {
  HealthCapabilitiesResponseSchema,
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
        code: "SERVICE_NOT_READY",
        status: "not_ready",
        error: "service_not_ready",
        capability: "service.readiness",
        retryable: true,
        retryAfterSeconds: 30,
        incidentId: "inc_123",
        message: "This feature is temporarily unavailable",
      }),
    ).toMatchObject({
      statusCode: 503,
      code: "SERVICE_NOT_READY",
      capability: "service.readiness",
      retryable: true,
    });
    expect(
      HealthNotReadyResponseSchema.safeParse({
        statusCode: 503,
        code: "SERVICE_NOT_READY",
        status: "not_ready",
        error: "password authentication failed",
        capability: "service.readiness",
        retryable: true,
        retryAfterSeconds: 30,
        incidentId: "inc_123",
        message: "postgresql://user:secret@example.invalid/database",
      }).success,
    ).toBe(false);
  });
  it("accepts a strict capability matrix for partial outages", () => {
    const parsed = HealthCapabilitiesResponseSchema.parse({
      status: "degraded",
      incidentId: "inc_123",
      retryAfterSeconds: 30,
      checkedAt: "2026-09-26T00:00:00.000Z",
      capabilities: {
        publicCatalog: "available",
        authSession: "degraded",
        communityRead: "unavailable",
        communityWrite: "unavailable",
        marketplaceRead: "unavailable",
        studioLocalEditing: "available",
        studioProjectRead: "unavailable",
        studioCloudSave: "unavailable",
        realtimeCollaboration: "unavailable",
        publishing: "unavailable",
        serverAi: "degraded",
      },
    });

    expect(parsed.status).toBe("degraded");
    expect(parsed.capabilities.studioLocalEditing).toBe("available");
  });

});
