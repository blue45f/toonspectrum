import { Module } from "@nestjs/common";

import { studioAiAdmissionSchemaPreflightProvider } from "./studio-ai-admission-schema-preflight";
import { studioAiAdmissionRepositoryProvider } from "./studio-ai-admission.repository";
import { StudioAiComicDirectorController } from "./studio-ai-comic-director.controller";
import {
  STUDIO_AI_COMIC_DIRECTOR_REPOSITORY,
  PostgresStudioAiComicDirectorRepository,
} from "./studio-ai-comic-director.repository";
import { StudioAiComicDirectorService } from "./studio-ai-comic-director.service";
import { studioAiIdempotencySchemaPreflightProvider } from "./studio-ai-idempotency-schema-preflight";
import { STUDIO_AI_USAGE_STORE } from "./studio-ai-usage";
import { PostgresStudioAiUsageStore } from "./studio-ai-usage.repository";
import { StudioAiController } from "./studio-ai.controller";
import { StudioAiService } from "./studio-ai.service";

@Module({
  controllers: [StudioAiController, StudioAiComicDirectorController],
  providers: [
    studioAiAdmissionRepositoryProvider,
    studioAiAdmissionSchemaPreflightProvider,
    studioAiIdempotencySchemaPreflightProvider,
    StudioAiService,
    StudioAiComicDirectorService,
    {
      provide: STUDIO_AI_COMIC_DIRECTOR_REPOSITORY,
      useFactory: () => new PostgresStudioAiComicDirectorRepository(),
    },
    {
      provide: STUDIO_AI_USAGE_STORE,
      useFactory: () => new PostgresStudioAiUsageStore(),
    },
  ],
})
export class StudioAiModule {}
