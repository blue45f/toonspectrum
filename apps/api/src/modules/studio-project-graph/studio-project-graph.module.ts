import { Module } from "@nestjs/common";

import { StudioProjectGraphController } from "./studio-project-graph.controller";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";

@Module({
  controllers: [StudioProjectGraphController],
  providers: [StudioProjectGraphRepository, StudioProjectGraphService],
  exports: [StudioProjectGraphService],
})
export class StudioProjectGraphModule {}
