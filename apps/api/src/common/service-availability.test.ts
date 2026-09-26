import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  capabilityUnavailableException,
  clearCapabilityIncident,
  databaseCapabilityUnavailableException,
  rethrowIfDatabaseCapabilityUnavailable,
  withDatabaseCapability,
} from "./service-availability";

describe("service availability contract", () => {
  it("creates a bounded public capability envelope with a stable incident id", () => {
    clearCapabilityIncident("community.read");
    const first = capabilityUnavailableException("community.read", {
      code: "DATABASE_UNAVAILABLE",
      retryAfterSeconds: 45,
    });
    const second = capabilityUnavailableException("community.read");

    expect(first).toBeInstanceOf(ServiceUnavailableException);
    expect(first.getResponse()).toMatchObject({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      status: "degraded",
      capability: "community.read",
      retryable: true,
      retryAfterSeconds: 45,
      message: "This feature is temporarily unavailable",
    });
    expect((first.getResponse() as { incidentId: string }).incidentId)
      .toBe((second.getResponse() as { incidentId: string }).incidentId);
  });

  it("maps database availability failures without exposing driver details", () => {
    const mapped = databaseCapabilityUnavailableException(
      Object.assign(new Error("compute time quota exceeded"), { code: "53000" }),
      "creator.works.read",
    );

    expect(mapped?.getResponse()).toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      capability: "creator.works.read",
    });
    expect(JSON.stringify(mapped?.getResponse())).not.toContain("quota");
  });

  it("does not reclassify client input failures as dependency outages", () => {
    expect(databaseCapabilityUnavailableException(
      new BadRequestException("invalid"),
      "community.read",
    )).toBeNull();
  });

  it("clears a capability incident after a successful protected action", async () => {
    clearCapabilityIncident("community.read");
    const before = capabilityUnavailableException("community.read");
    const beforeId = (before.getResponse() as { incidentId: string }).incidentId;

    await expect(withDatabaseCapability("community.read", async () => "ok"))
      .resolves.toBe("ok");

    const after = capabilityUnavailableException("community.read");
    expect((after.getResponse() as { incidentId: string }).incidentId)
      .not.toBe(beforeId);
  });

  it("rethrows only known availability failures from fallback boundaries", () => {
    expect(() => rethrowIfDatabaseCapabilityUnavailable(
      new Error("projection bug"),
      "creator.publication.read",
    )).not.toThrow();
    expect(() => rethrowIfDatabaseCapabilityUnavailable(
      Object.assign(new Error("compute time quota exceeded"), { code: "53000" }),
      "creator.publication.read",
    )).toThrow(ServiceUnavailableException);
  });

});
