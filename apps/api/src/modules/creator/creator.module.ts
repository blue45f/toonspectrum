import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";

@Module({
  controllers: [CreatorController],
  providers: [creatorCollaborationRepositoryProvider, CreatorService],
})
export class CreatorModule {}
