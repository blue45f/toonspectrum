import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { databaseIncidentId } from "../../common/service-availability";
import {
  HealthCapabilitiesResponseSchema,
  HealthLiveResponseSchema,
  HealthNotReadyResponseSchema,
  HealthReadyResponseSchema,
  type HealthCapabilitiesResponseDto,
  type HealthLiveResponseDto,
  type HealthReadyResponseDto,
} from "./health.dto";
import { createReadinessFailureReporter } from "./health-readiness-diagnostic";
import { HealthService } from "./health.service";

const CHECK_NAMES = [
  "database",
  "schema",
  "realtime",
  "objectStorage",
  "coordination",
  "durableQueueExecutor",
] as const;

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly reportReadiness = createReadinessFailureReporter(
    (message) => this.logger.warn(message),
  );

  constructor(
    @Inject(HealthService)
    private readonly health: HealthService,
  ) {}

  @Get("live")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  live(): HealthLiveResponseDto {
    return HealthLiveResponseSchema.parse({ status: "ok" });
  }

  @Get("ready")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async ready(): Promise<HealthReadyResponseDto> {
    const readiness = await this.health.checkReadiness();
    this.reportReadiness(readiness, process.env.DATABASE_URL);
    if (!readiness.ready) {
      const failedChecks = CHECK_NAMES.filter(
        (key) => readiness[key] !== true,
      );
      throw new ServiceUnavailableException(
        HealthNotReadyResponseSchema.parse({
          statusCode: 503,
          status: "not_ready",
          error: "service_not_ready",
          code: "SERVICE_NOT_READY",
          capability: "service.readiness",
          retryable: true,
          retryAfterSeconds: 60,
          incidentId: databaseIncidentId("service.readiness", {
            code: failedChecks.join("-") || "unknown",
          }),
          message: "Service is not ready",
        }),
      );
    }
    return HealthReadyResponseSchema.parse({ status: "ready" });
  }

  @Get("capabilities")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async capabilities(): Promise<HealthCapabilitiesResponseDto> {
    return HealthCapabilitiesResponseSchema.parse(
      await this.health.checkCapabilities(),
    );
  }
}
