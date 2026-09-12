import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { BackendCapabilitiesModule } from "../infrastructure/backend-capabilities/backend-capabilities.module";
import { AdminModule } from "../modules/admin/admin.module";
import { CatalogModule } from "../modules/catalog/catalog.module";
import { CommunityModule } from "../modules/community/community.module";
import { CreatorMarketplaceSocialBoundaryGuard } from "../modules/creator-marketplace/creator-marketplace-social-boundary.guard";
import { FeedbackModule } from "../modules/feedback/feedback.module";
import { FortuneModule } from "../modules/fortune/fortune.module";
import { HealthModule } from "../modules/health/health.module";
import { LegalModule } from "../modules/legal/legal.module";
import { MeModule } from "../modules/me/me.module";
import { TrafficAnalyticsModule } from "../modules/traffic-analytics/traffic-analytics.module";

import { ApiHttpInfrastructureModule } from "./api-http-infrastructure.module";

@Module({
  imports: [
    ApiHttpInfrastructureModule, BackendCapabilitiesModule, MeModule, CommunityModule,
    CatalogModule, AdminModule, TrafficAnalyticsModule, FeedbackModule, HealthModule,
    LegalModule, FortuneModule,
  ],
  // This guard protects generic /me and /reviews writes too. Preserve it WITHOUT
  // importing the entire Marketplace/Studio product graph into the general API.
  providers: [{ provide: APP_GUARD, useClass: CreatorMarketplaceSocialBoundaryGuard }],
})
export class GeneralApiModule {}
