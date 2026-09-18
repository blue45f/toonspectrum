import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module";
import { PromotionModule } from "../promotion/promotion.module";
import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { MembershipOperationsModule } from "../membership-operations/membership-operations.module";

import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [
    CollaborationModule,
    PromotionModule,
    MembershipWalletModule,
    MembershipOperationsModule,
  ],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
