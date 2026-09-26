import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { TeamWorkspaceController } from "./team-workspace.controller";
import { PRODUCTION_TEAM_POOL, TeamWorkspaceRepository } from "./team-workspace.repository";
import { ProductionCollaborationController } from "./production-collaboration.controller";
import { ProductionIntegrationController } from "./production-integration.controller";
import { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionIntegrationRepository } from "./production-integration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { ProductionIntegrationService } from "./production-integration.service";

@Module({
  controllers: [ProductionCollaborationController, ProductionIntegrationController, TeamWorkspaceController],
  providers: [
    { provide: PRODUCTION_TEAM_POOL, useValue: dbPool },
    TeamWorkspaceRepository,
    ProductionCollaborationRepository,
    ProductionCollaborationService,
    ProductionIntegrationRepository,
    ProductionIntegrationService,
  ],
  exports: [ProductionCollaborationService],
})
export class ProductionCollaborationModule {}
