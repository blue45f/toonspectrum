import { Module } from "@nestjs/common";

import { ProductionCollaborationController } from "./production-collaboration.controller";
import { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

@Module({
  controllers: [ProductionCollaborationController],
  providers: [ProductionCollaborationRepository, ProductionCollaborationService],
  exports: [ProductionCollaborationService],
})
export class ProductionCollaborationModule {}
