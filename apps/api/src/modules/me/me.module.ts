import { Module } from "@nestjs/common";

import { MembershipWalletModule } from "../membership-wallet/membership-wallet.module";
import {
  MEMBERSHIP_REWARD_SERVICE,
  type MembershipRewardService,
} from "../membership-wallet/membership-wallet.tokens";

import {
  ME_COLLECTION_REPOSITORY,
  meCollectionRepositoryProvider,
  type MeCollectionRepository,
} from "./me-collection.repository";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

const meServiceProvider = {
  provide: MeService,
  inject: [ME_COLLECTION_REPOSITORY, MEMBERSHIP_REWARD_SERVICE],
  useFactory: (
    collectionRepository: MeCollectionRepository,
    membershipWallet: MembershipRewardService,
  ): MeService => new MeService(collectionRepository, membershipWallet),
};

@Module({
  imports: [MembershipWalletModule],
  controllers: [MeController],
  providers: [meCollectionRepositoryProvider, meServiceProvider],
})
export class MeModule {}
