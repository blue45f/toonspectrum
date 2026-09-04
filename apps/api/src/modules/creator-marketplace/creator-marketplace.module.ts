import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { CreatorMarketplaceLibraryController } from "./creator-marketplace-library.controller";
import { CREATOR_MARKETPLACE_LIBRARY_REPOSITORY_PROVIDER } from "./creator-marketplace-library.repository";
import { CreatorMarketplaceLibraryService } from "./creator-marketplace-library.service";
import { creatorMarketplacePublishGateProvider } from "./creator-marketplace-publish-gate.repository";
import { CreatorMarketplaceSocialBoundaryGuard } from "./creator-marketplace-social-boundary.guard";
import { CreatorMarketplaceSocialController } from "./creator-marketplace-social.controller";
import { CreatorMarketplaceSocialService } from "./creator-marketplace-social.service";
import { CreatorMarketplaceController } from "./creator-marketplace.controller";
import { creatorMarketplaceResourceRepositoryProvider } from "./creator-marketplace.repository";
import { CreatorMarketplaceService } from "./creator-marketplace.service";

@Module({
  controllers: [
    CreatorMarketplaceController,
    CreatorMarketplaceLibraryController,
    CreatorMarketplaceSocialController,
  ],
  providers: [
    CREATOR_MARKETPLACE_LIBRARY_REPOSITORY_PROVIDER,
    CreatorMarketplaceLibraryService,
    creatorMarketplacePublishGateProvider,
    creatorMarketplaceResourceRepositoryProvider,
    CreatorMarketplaceService,
    CreatorMarketplaceSocialService,
    {
      provide: APP_GUARD,
      useClass: CreatorMarketplaceSocialBoundaryGuard,
    },
  ],
})
export class CreatorMarketplaceModule {}
