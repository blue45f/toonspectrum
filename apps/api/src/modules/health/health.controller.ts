import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  HealthLiveResponseSchema,
  HealthNotReadyResponseSchema,
  HealthReadyResponseSchema,
  type HealthLiveResponseDto,
  type HealthReadyResponseDto,
} from "./health.dto";
import { HealthService } from "./health.service";
import { createReadinessFailureReporter } from "./health-readiness-diagnostic";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly reportReadiness = createReadinessFailureReporter((message) => this.logger.warn(message));

  constructor(
    @Inject(HealthService)
    private readonly health: HealthService,
  ) {}

  @Get("live")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  live(): HealthLiveResponseDto {
    // Liveness intentionally has no database, schema, socket, or external-provider dependency.
    return HealthLiveResponseSchema.parse({ status: "ok" });
  }

  @Get("ready")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async ready(): Promise<HealthReadyResponseDto> {
    const readiness = await this.health.checkReadiness();
    this.reportReadiness(readiness, process.env.DATABASE_URL);
    if (!readiness.ready) {
      throw new ServiceUnavailableException(
        HealthNotReadyResponseSchema.parse({
          statusCode: 503,
          status: "not_ready",
          error: "service_not_ready",
          message: "Service is not ready",
        }),
      );
    }
    return HealthReadyResponseSchema.parse({ status: "ready" });
  }
}
