import { Module } from "@nestjs/common";

import { IntegrationPlatformController } from "./integration-platform.controller";
import { IntegrationPlatformService } from "./integration-platform.service";

@Module({
  controllers: [IntegrationPlatformController],
  providers: [IntegrationPlatformService],
  exports: [IntegrationPlatformService],
})
export class IntegrationPlatformModule {}
