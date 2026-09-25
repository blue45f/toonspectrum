import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
} from "@nestjs/common";

import {
  HealthCapabilitiesResponseSchema,
  HealthLiveResponseSchema,
  HealthNotReadyResponseSchema,
  HealthReadyResponseSchema,
  type HealthCapabilitiesResponseDto,
  type HealthLiveResponseDto,
  type HealthReadyResponseDto,
} from "./health.dto";
import { HealthService } from "./health.service";
import { createReadinessFailureReporter } from "./health-readiness-diagnostic";
import { capabilityUnavailableException } from "../../common/service-availability";

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


  @Get("capabilities")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async capabilities(): Promise<HealthCapabilitiesResponseDto> {
    return HealthCapabilitiesResponseSchema.parse(
      await this.health.checkCapabilities(),
    );
  }

  @Get("ready")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async ready(): Promise<HealthReadyResponseDto> {
    const readiness = await this.health.checkReadiness();
    this.reportReadiness(readiness, process.env.DATABASE_URL);
    if (!readiness.ready) {
      const exception = capabilityUnavailableException("service.readiness", {
        code: "SERVICE_NOT_READY",
        status: "not_ready",
        legacyError: "service_not_ready",
      });
      HealthNotReadyResponseSchema.parse(exception.getResponse());
      throw exception;
    }
    return HealthReadyResponseSchema.parse({ status: "ready" });
  }
}
