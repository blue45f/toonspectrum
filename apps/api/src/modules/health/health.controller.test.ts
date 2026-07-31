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
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      statusCode: 503,
      status: "not_ready",
      error: "service_not_ready",
      message: "Service is not ready",
    });
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse()))
      .not.toMatch(/postgres|socket|password|secret|database/iu);
  });
});
