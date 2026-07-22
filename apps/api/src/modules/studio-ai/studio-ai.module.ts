import { Module } from "@nestjs/common";

import { studioAiAdmissionSchemaPreflightProvider } from "./studio-ai-admission-schema-preflight";
import { studioAiAdmissionRepositoryProvider } from "./studio-ai-admission.repository";
import { studioAiIdempotencySchemaPreflightProvider } from "./studio-ai-idempotency-schema-preflight";
import { STUDIO_AI_USAGE_STORE } from "./studio-ai-usage";
import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";
import { StudioAiController } from "./studio-ai.controller";
import { StudioAiService } from "./studio-ai.service";

@Module({
  controllers: [StudioAiController],
  providers: [
    studioAiAdmissionRepositoryProvider,
    studioAiAdmissionSchemaPreflightProvider,
    studioAiIdempotencySchemaPreflightProvider,
    StudioAiService,
    {
      provide: STUDIO_AI_USAGE_STORE,
      useFactory: () => new PostgresStudioAiUsageStore(),
    },
  ],
})
export class StudioAiModule {}
