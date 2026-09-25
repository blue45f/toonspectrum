import { Module, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

const metadataLightHealthService = {
  checkReadiness: async () => ({
    ready: true,
    database: true,
    schema: true,
    realtime: true,
    objectStorage: true,
  }),
};

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HealthService,
      useValue: metadataLightHealthService,
    },
  ],
})
class MetadataLightHealthControllerTestModule {}

describe("HealthController", () => {
  it("injects HealthService when decorator type metadata is unavailable", async () => {
    const application = await NestFactory.createApplicationContext(
      MetadataLightHealthControllerTestModule,
      { logger: false },
    );

    try {
      await expect(
        application.get(HealthController).ready(),
      ).resolves.toEqual({ status: "ready" });
    } finally {
      await application.close();
    }
  });

  it("keeps liveness independent from readiness dependencies", () => {
    const checkReadiness = vi.fn();
    const controller = new HealthController({ checkReadiness } as never);

    expect(controller.live()).toEqual({ status: "ok" });
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it("returns the minimal ready envelope after every strict check passes", async () => {
    const controller = new HealthController({
      checkReadiness: vi.fn(async () => ({
        ready: true,
        database: true,
        schema: true,
        realtime: true,
      })),
    } as never);

    await expect(controller.ready()).resolves.toEqual({ status: "ready" });
  });


  it("returns user-facing capability state without failing the status request", async () => {
    const checkCapabilities = vi.fn(async () => ({
      status: "degraded" as const,
      incidentId: "inc_status",
      retryAfterSeconds: 30,
      checkedAt: "2026-09-26T00:00:00.000Z",
      capabilities: {
        publicCatalog: "available" as const,
        authSession: "degraded" as const,
        communityRead: "unavailable" as const,
        communityWrite: "unavailable" as const,
        marketplaceRead: "unavailable" as const,
        studioLocalEditing: "available" as const,
        studioProjectRead: "unavailable" as const,
        studioCloudSave: "unavailable" as const,
        realtimeCollaboration: "unavailable" as const,
        publishing: "unavailable" as const,
        serverAi: "degraded" as const,
      },
    }));
    const controller = new HealthController({ checkCapabilities } as never);

    await expect(controller.capabilities()).resolves.toMatchObject({
      status: "degraded",
      incidentId: "inc_status",
      capabilities: {
        publicCatalog: "available",
        communityRead: "unavailable",
        studioLocalEditing: "available",
      },
    });
  });

  it("returns a generic 503 without database or socket internals", async () => {
    const controller = new HealthController({
      checkReadiness: vi.fn(async () => ({
        ready: false,
        database: false,
        schema: false,
        realtime: false,
      })),
    } as never);

    const error = await controller.ready().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      statusCode: 503,
      code: "SERVICE_NOT_READY",
      status: "not_ready",
      error: "service_not_ready",
      capability: "service.readiness",
      retryable: true,
      retryAfterSeconds: 30,
      incidentId: expect.stringMatching(/^inc_/u),
      message: "This feature is temporarily unavailable",
    });
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse()))
      .not.toMatch(/postgres|socket|password|secret|database/iu);
  });
});
