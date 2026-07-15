import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";
import { studioCrdtRepositoryProvider } from "./studio-crdt.repository";
import { StudioCrdtService } from "./studio-crdt.service";
import { studioLiveLockRepositoryProvider } from "./studio-live-lock.repository";
import {
  StudioLiveGateway,
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.gateway";

@Module({
  controllers: [CreatorController],
  providers: [
    creatorCollaborationRepositoryProvider,
    studioCrdtRepositoryProvider,
    studioLiveLockRepositoryProvider,
    CreatorService,
    StudioCrdtService,
    studioLiveSessionAuthenticatorProvider,
    studioLiveSessionRevalidatorProvider,
    StudioLiveGateway,
  ],
})
export class CreatorModule {}
