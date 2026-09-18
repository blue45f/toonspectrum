import { Module } from "@nestjs/common";

import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import { StudioProjectGraphController } from "./studio-project-graph.controller";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";

@Module({
  controllers: [StudioProjectGraphController],
  providers: [
    StudioProjectGraphRepository,
    StudioExternalFileBindingRepository,
    StudioProjectGraphService,
  ],
  exports: [StudioProjectGraphService],
})
export class StudioProjectGraphModule {}
