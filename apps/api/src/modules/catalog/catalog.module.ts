import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { CatalogPublicCacheInterceptor } from "./catalog-public-cache.interceptor";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { KmasReferenceController } from "./kmas-reference.controller";
import { LazyServerlessCatalogService } from "./lazy-serverless-catalog.service";

@Module({
  controllers: [CatalogController, KmasReferenceController],
  providers: [
    { provide: CatalogService, useClass: LazyServerlessCatalogService },
    { provide: APP_INTERCEPTOR, useClass: CatalogPublicCacheInterceptor },
  ],
})
export class CatalogModule {}
