import { Module } from "@nestjs/common";

import { creatorCollaborationRepositoryProvider } from "./creator-collaboration.repository";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";
import {
  StudioRasterAssetUploadGuard,
  StudioWorkAssetUploadGuard,
} from "./studio-asset-upload.guard";
import { studioCrdtClusterLoadRepositoryProvider } from "./studio-crdt-cluster-load.repository";
import { studioCrdtRepositoryProvider } from "./studio-crdt.repository";
import { StudioCrdtService } from "./studio-crdt.service";
import { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";
import { studioLiveLockRepositoryProvider } from "./studio-live-lock.repository";
import { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";
import { StudioLiveGateway } from "./studio-live.gateway";
import {
  studioLiveSessionAuthenticatorProvider,
  studioLiveSessionRevalidatorProvider,
} from "./studio-live.protocol";
import { StudioRasterAssetController } from "./studio-raster-asset.controller";
import { studioRasterAssetRepositoryProvider } from "./studio-raster-asset.repository";
import { StudioRasterAssetService } from "./studio-raster-asset.service";
import { StudioTeamCommentController } from "./studio-team-comment.controller";
import { studioTeamCommentRepositoryProvider } from "./studio-team-comment.repository";
import { StudioTeamCommentService } from "./studio-team-comment.service";
import { StudioVoiceIcePolicyController } from "./studio-voice-ice-policy.controller";
import {
  StudioVoiceIcePolicyService,
  studioVoiceIceConfigurationProvider,
} from "./studio-voice-ice-policy.service";
import { StudioWorkAssetController } from "./studio-work-asset.controller";
import { studioWorkAssetRepositoryProvider } from "./studio-work-asset.repository";
import { StudioWorkAssetService } from "./studio-work-asset.service";

@Module({
  controllers: [
    CreatorController,
    StudioRasterAssetController,
    StudioTeamCommentController,
    StudioVoiceIcePolicyController,
    StudioWorkAssetController,
  ],
  providers: [
    creatorCollaborationRepositoryProvider,
    studioCrdtClusterLoadRepositoryProvider,
    studioCrdtRepositoryProvider,
    studioLiveLockRepositoryProvider,
    studioRasterAssetRepositoryProvider,
    studioTeamCommentRepositoryProvider,
    studioVoiceIceConfigurationProvider,
    studioWorkAssetRepositoryProvider,
    CreatorService,
    StudioRasterAssetService,
    StudioTeamCommentService,
    StudioVoiceIcePolicyService,
    StudioWorkAssetService,
    StudioRasterAssetUploadGuard,
    StudioWorkAssetUploadGuard,
    StudioCrdtService,
    studioLiveSessionAuthenticatorProvider,
    studioLiveSessionRevalidatorProvider,
    StudioLiveJoinTransitionSequencer,
    StudioLiveSocketAuthService,
    StudioLiveGateway,
  ],
})
export class CreatorModule {}
