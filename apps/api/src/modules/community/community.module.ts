import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module";
import { PromotionModule } from "../promotion/promotion.module";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [CollaborationModule, PromotionModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
