import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { MembershipWalletController } from "./membership-wallet.controller";
import { MembershipWalletService } from "./membership-wallet.service";
import { MEMBERSHIP_REWARD_SERVICE } from "./membership-wallet.tokens";

@Module({
  controllers: [MembershipWalletController],
  providers: [
    MembershipWalletService,
    {
      provide: MEMBERSHIP_REWARD_SERVICE,
      useExisting: MembershipWalletService,
    },
    AdminMutationGuard,
  ],
  exports: [MembershipWalletService, MEMBERSHIP_REWARD_SERVICE],
})
export class MembershipWalletModule {}
