import { Module } from "@nestjs/common";

import { ProductionCollaborationModule } from "../production-collaboration/production-collaboration.module";
import { IntegrationPlatformController } from "./integration-platform.controller";
import { IntegrationPlatformService } from "./integration-platform.service";
import { IntegrationRuntimeController } from "./integration-runtime.controller";
import { IntegrationRuntimeProviderEngine } from "./integration-runtime.providers";
import {
  INTEGRATION_RUNTIME_DAILY_LIMIT,
  IntegrationRuntimeRepository,
  resolveIntegrationRuntimeDailyLimit,
} from "./integration-runtime.repository";
import {
  INTEGRATION_RUNTIME_ENGINE,
  IntegrationRuntimeService,
} from "./integration-runtime.service";

@Module({
  imports: [ProductionCollaborationModule],
  controllers: [IntegrationPlatformController, IntegrationRuntimeController],
  providers: [
    IntegrationPlatformService,
    {
      provide: INTEGRATION_RUNTIME_DAILY_LIMIT,
      useFactory: () => resolveIntegrationRuntimeDailyLimit(),
    },
    IntegrationRuntimeRepository,
    IntegrationRuntimeService,
    {
      provide: INTEGRATION_RUNTIME_ENGINE,
      useFactory: () => new IntegrationRuntimeProviderEngine(),
    },
  ],
  exports: [IntegrationPlatformService, IntegrationRuntimeService],
})
export class IntegrationPlatformModule {}
