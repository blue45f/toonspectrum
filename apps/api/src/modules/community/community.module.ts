import { Module } from "@nestjs/common";
import { PromotionModule } from "../promotion/promotion.module";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [PromotionModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
