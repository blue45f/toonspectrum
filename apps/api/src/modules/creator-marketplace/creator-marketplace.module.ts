import { Module } from "@nestjs/common";

import { CreatorMarketplaceLibraryController } from "./creator-marketplace-library.controller";
import { CREATOR_MARKETPLACE_LIBRARY_REPOSITORY_PROVIDER } from "./creator-marketplace-library.repository";
import { CreatorMarketplaceLibraryService } from "./creator-marketplace-library.service";
import { creatorMarketplacePublishGateProvider } from "./creator-marketplace-publish-gate.repository";
import { CreatorMarketplaceController } from "./creator-marketplace.controller";
import { creatorMarketplaceResourceRepositoryProvider } from "./creator-marketplace.repository";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

@Module({
  controllers: [
    CreatorMarketplaceController,
    CreatorMarketplaceLibraryController,
  ],
  providers: [
    CREATOR_MARKETPLACE_LIBRARY_REPOSITORY_PROVIDER,
    CreatorMarketplaceLibraryService,
    creatorMarketplacePublishGateProvider,
    creatorMarketplaceResourceRepositoryProvider,
    CreatorMarketplaceService,
  ],
})
export class CreatorMarketplaceModule {}
