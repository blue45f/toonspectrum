import { Module } from "@nestjs/common";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";
import { PromotionModule } from "../promotion/promotion.module";

@Module({
  imports: [PromotionModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
