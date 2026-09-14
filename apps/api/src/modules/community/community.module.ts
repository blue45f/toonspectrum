import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [CollaborationModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
