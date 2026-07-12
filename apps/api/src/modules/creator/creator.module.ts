import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";
import {
  StudioLiveGateway,
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.gateway";

@Module({
  controllers: [CreatorController],
  providers: [
    creatorCollaborationRepositoryProvider,
    CreatorService,
    studioLiveSessionAuthenticatorProvider,
    studioLiveSessionRevalidatorProvider,
    StudioLiveGateway,
  ],
})
export class CreatorModule {}
