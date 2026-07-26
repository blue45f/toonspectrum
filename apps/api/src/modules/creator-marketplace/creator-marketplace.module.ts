import { Module } from "@nestjs/common";

import { creatorMarketplacePublishGateProvider } from "./creator-marketplace-publish-gate.repository";
import { CreatorMarketplaceController } from "./creator-marketplace.controller";
import { creatorMarketplaceResourceRepositoryProvider } from "./creator-marketplace.repository";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

@Module({
  controllers: [CreatorMarketplaceController],
  providers: [
    creatorMarketplacePublishGateProvider,
    creatorMarketplaceResourceRepositoryProvider,
    CreatorMarketplaceService,
  ],
})
export class CreatorMarketplaceModule {}
