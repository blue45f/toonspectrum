// apps/api/src/modules/fortune/fortune.module.ts

import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import { FortuneProvenanceController } from "./fortune-provenance.controller";
import { FortuneController } from "./fortune.controller";
import { FortuneService } from "./fortune.service";

@Module({
  imports: [MembershipWalletModule],
  controllers: [FortuneController, FortuneProvenanceController],
  providers: [FortuneService],
  exports: [FortuneService]
})
export class FortuneModule {}
