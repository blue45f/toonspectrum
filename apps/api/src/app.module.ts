import { Module } from "@nestjs/common";

import { BackendCapabilitiesModule } from "./infrastructure/backend-capabilities/backend-capabilities.module";
import { ApiHttpInfrastructureModule } from "./runtime/api-http-infrastructure.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CommunityModule } from "./modules/community/community.module";
import { CreatorModule } from "./modules/creator/creator.module";
import { CreatorMarketplaceModule } from "./modules/creator-marketplace/creator-marketplace.module";
import { CreatorResourcesModule } from "./modules/creator-resources/creator-resources.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { FortuneModule } from "./modules/fortune/fortune.module";
import { HealthModule } from "./modules/health/health.module";
import { LegalModule } from "./modules/legal/legal.module";
import { MeModule } from "./modules/me/me.module";
import { StudioAiModule } from "./modules/studio-ai/studio-ai.module";
import { StudioMusicModule } from "./modules/studio-music/studio-music.module";
import { createStudioRealtimeTicketDynamicModule } from "./modules/studio-realtime-ticket/studio-realtime-ticket.integration";
import { TrafficAnalyticsModule } from "./modules/traffic-analytics/traffic-analytics.module";

const studioRealtimeTicketModule =
  createStudioRealtimeTicketDynamicModule(process.env);

@Module({
  imports: [
    ApiHttpInfrastructureModule,
    BackendCapabilitiesModule,
    AuthModule,
    MeModule,
    CommunityModule,
    CatalogModule,
    AdminModule,
    TrafficAnalyticsModule,
    FeedbackModule,
    CreatorMarketplaceModule,
    CreatorModule,
    CreatorResourcesModule,
    ...(studioRealtimeTicketModule
      ? [studioRealtimeTicketModule]
      : []),
    HealthModule,
    LegalModule,
    FortuneModule,
    StudioAiModule,
    StudioMusicModule,
  ],
})
export class AppModule {}
