import { Module } from "@nestjs/common";

import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { KmasReferenceController } from "./kmas-reference.controller";

@Module({
  controllers: [CatalogController, KmasReferenceController],
  providers: [CatalogService],
})
export class CatalogModule {}
