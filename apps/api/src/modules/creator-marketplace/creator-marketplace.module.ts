import { Module } from "@nestjs/common";

import { CreatorMarketplaceController } from "./creator-marketplace.controller";
import { creatorMarketplaceResourceRepositoryProvider } from "./creator-marketplace.repository";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

@Module({
  controllers: [CreatorMarketplaceController],
  providers: [
    creatorMarketplaceResourceRepositoryProvider,
    CreatorMarketplaceService,
  ],
})
export class CreatorMarketplaceModule {}
