import { Module } from "@nestjs/common";

import { MembershipOperationsController } from "./membership-operations.controller";
import { MembershipOperationsService } from "./membership-operations.service";
import { MembershipRewardReversalService } from "./membership-reward-reversal.service";

@Module({
  controllers: [MembershipOperationsController],
  providers: [
    MembershipOperationsService,
    MembershipRewardReversalService,
  ],
  exports: [MembershipOperationsService, MembershipRewardReversalService],
})
export class MembershipOperationsModule {}
