import { Module } from "@nestjs/common";

import { CreatorMarketplaceModule } from "../creator-marketplace/creator-marketplace.module";
import { OgController } from "./og.controller";

@Module({
  imports: [CreatorMarketplaceModule],
  controllers: [OgController],
})
export class OgModule {}
