import { Module } from "@nestjs/common";

import { CreatorModule } from "../modules/creator/creator.module";
import { CreatorMarketplaceModule } from "../modules/creator-marketplace/creator-marketplace.module";
import { CreatorResourcesModule } from "../modules/creator-resources/creator-resources.module";
import { StudioAiModule } from "../modules/studio-ai/studio-ai.module";
import { StudioMusicModule } from "../modules/studio-music/studio-music.module";
import { createStudioRealtimeTicketDynamicModule } from "../modules/studio-realtime-ticket/studio-realtime-ticket.integration";

import { ApiHttpInfrastructureModule } from "./api-http-infrastructure.module";

const ticketModule = createStudioRealtimeTicketDynamicModule(process.env);

// Reuse product controllers/guards/providers unchanged; do not import AppModule or CatalogModule.
@Module({
  imports: [
    ApiHttpInfrastructureModule,
    CreatorModule,
    CreatorMarketplaceModule,
    CreatorResourcesModule,
    StudioAiModule,
    StudioMusicModule,
    ...(ticketModule ? [ticketModule] : []),
  ],
})
export class StudioApiModule {}
