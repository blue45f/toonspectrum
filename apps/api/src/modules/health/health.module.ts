import { Module } from "@nestjs/common";

import { BackendCapabilitiesModule } from "../../infrastructure/backend-capabilities/backend-capabilities.module";

import { healthReadinessRepositoryProvider } from "./health-readiness.repository";
import {
  HEALTH_RUNTIME_READINESS,
  NestHealthRuntimeReadiness,
} from "./health-runtime-readiness";
import { HealthController } from "./health.controller";
import {
  HEALTH_ENVIRONMENT,
  HealthService,
  type HealthEnvironment,
} from "./health.service";

@Module({
  imports: [BackendCapabilitiesModule],
  controllers: [HealthController],
  providers: [
    healthReadinessRepositoryProvider,
    NestHealthRuntimeReadiness,
    {
      provide: HEALTH_RUNTIME_READINESS,
      useExisting: NestHealthRuntimeReadiness,
    },
    {
      provide: HEALTH_ENVIRONMENT,
      useFactory: (): HealthEnvironment => process.env,
    },
    HealthService,
  ],
})
export class HealthModule {}
