import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";
import { PromotionModule } from "../promotion/promotion.module";

@Module({
  imports: [PromotionModule, CollaborationModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
