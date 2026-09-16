import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { CatalogPublicCacheInterceptor } from "./catalog-public-cache.interceptor";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { KmasReferenceController } from "./kmas-reference.controller";

@Module({
  controllers: [CatalogController, KmasReferenceController],
  providers: [
    CatalogService,
    { provide: APP_INTERCEPTOR, useClass: CatalogPublicCacheInterceptor },
  ],
})
export class CatalogModule {}
