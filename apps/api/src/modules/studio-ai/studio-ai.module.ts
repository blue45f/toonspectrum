import { Module } from "@nestjs/common";

import { STUDIO_AI_USAGE_STORE } from "./studio-ai-usage";
import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";
import { StudioAiController } from "./studio-ai.controller";
import { StudioAiService } from "./studio-ai.service";

@Module({
  controllers: [StudioAiController],
  providers: [
    StudioAiService,
    {
      provide: STUDIO_AI_USAGE_STORE,
      useFactory: () => new PostgresStudioAiUsageStore(),
    },
  ],
})
export class StudioAiModule {}
