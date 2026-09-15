import { Module } from "@nestjs/common";

import { ProductionCollaborationController } from "./production-collaboration.controller";
import { ProductionIntegrationController } from "./production-integration.controller";
import { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionIntegrationRepository } from "./production-integration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { ProductionIntegrationService } from "./production-integration.service";

@Module({
  controllers: [ProductionCollaborationController, ProductionIntegrationController],
  providers: [
    ProductionCollaborationRepository,
    ProductionCollaborationService,
    ProductionIntegrationRepository,
    ProductionIntegrationService,
  ],
  exports: [ProductionCollaborationService],
})
export class ProductionCollaborationModule {}
