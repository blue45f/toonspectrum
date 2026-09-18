import { Module } from "@nestjs/common";

import { AdminMutationGuard } from "../admin/admin-mutation.guard";

import { MembershipWalletController } from "./membership-wallet.controller";
import { MembershipWalletService } from "./membership-wallet.service";

@Module({
  controllers: [MembershipWalletController],
  providers: [MembershipWalletService, AdminMutationGuard],
  exports: [MembershipWalletService],
})
export class MembershipWalletModule {}
